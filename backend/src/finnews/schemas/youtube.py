from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class YoutubeSourceRequest(BaseModel):
    video_url: str = Field(min_length=5)


class YoutubeSourceResponse(BaseModel):
    id: int
    video_id: str
    video_url: str
    title: str | None
    channel_name: str | None
    language: str | None
    summary: str | None
    status: str
    error_msg: str | None
    created_at: datetime
    processed_at: datetime | None
    channel_db_id: int | None


class YoutubeChannelRequest(BaseModel):
    channel_url: str = Field(min_length=5)


class YoutubeChannelResponse(BaseModel):
    id: int
    channel_id: str
    channel_url: str
    name: str | None
    last_fetched_at: datetime | None
    created_at: datetime


class RefreshChannelsResponse(BaseModel):
    new_videos: int
