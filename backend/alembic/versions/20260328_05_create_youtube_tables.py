"""create youtube_channels and youtube_sources tables

Revision ID: 20260328_05
Revises: 20260327_04
Create Date: 2026-03-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260328_05"
down_revision = "20260327_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "youtube_channels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel_id", sa.String(64), nullable=False),
        sa.Column("channel_url", sa.Text(), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_youtube_channels_user_id", "youtube_channels", ["user_id"])

    op.create_table(
        "youtube_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel_db_id", sa.Integer(), sa.ForeignKey("youtube_channels.id", ondelete="SET NULL"), nullable=True),
        sa.Column("video_id", sa.String(20), nullable=False),
        sa.Column("video_url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("channel_name", sa.String(200), nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("error_msg", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_youtube_sources_user_id", "youtube_sources", ["user_id"])
    op.create_index("ix_youtube_sources_video_id", "youtube_sources", ["user_id", "video_id"])


def downgrade() -> None:
    op.drop_index("ix_youtube_sources_video_id", table_name="youtube_sources")
    op.drop_index("ix_youtube_sources_user_id", table_name="youtube_sources")
    op.drop_table("youtube_sources")
    op.drop_index("ix_youtube_channels_user_id", table_name="youtube_channels")
    op.drop_table("youtube_channels")
