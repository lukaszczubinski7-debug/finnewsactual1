"""create threads table

Revision ID: 20260315_02
Revises: 20260308_01
Create Date: 2026-03-15 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260315_02"
down_revision: Union[str, Sequence[str], None] = "20260308_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "threads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("assets", sa.String(length=500), nullable=True),
        sa.Column("horizon_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("extra_context", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="initializing"),
        sa.Column("new_events_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("context_snapshot", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_refreshed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_threads_id"), "threads", ["id"], unique=False)
    op.create_index(op.f("ix_threads_user_id"), "threads", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_threads_user_id"), table_name="threads")
    op.drop_index(op.f("ix_threads_id"), table_name="threads")
    op.drop_table("threads")
