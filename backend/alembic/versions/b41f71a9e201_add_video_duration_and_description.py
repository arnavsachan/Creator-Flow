"""add_video_duration_and_description

Revision ID: b41f71a9e201
Revises: 6dd95def1a4a
Create Date: 2026-10-21 18:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b41f71a9e201'
down_revision: Union[str, Sequence[str], None] = '6dd95def1a4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add duration and description to channel_videos."""
    op.add_column('channel_videos', sa.Column('duration', sa.String(length=50), nullable=True))
    op.add_column('channel_videos', sa.Column('duration_seconds', sa.Integer(), nullable=True))
    op.add_column('channel_videos', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('channel_videos', 'description')
    op.drop_column('channel_videos', 'duration_seconds')
    op.drop_column('channel_videos', 'duration')
