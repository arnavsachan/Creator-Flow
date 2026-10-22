"""create_video_ideas_table

Revision ID: f9a23b4c5d6e
Revises: e8f12a3b4c5d
Create Date: 2026-10-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f9a23b4c5d6e'
down_revision: Union[str, Sequence[str], None] = 'e8f12a3b4c5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'video_ideas',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('channel_id', sa.String(length=100), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('topic', sa.String(length=500), nullable=False),
        sa.Column('niche', sa.String(length=255), nullable=True),
        sa.Column('target_audience', sa.String(length=255), nullable=True),
        sa.Column('language', sa.String(length=50), server_default='English', nullable=False),
        sa.Column('platform', sa.String(length=50), server_default='YouTube', nullable=False),
        sa.Column('content_format', sa.String(length=50), server_default='long_form', nullable=False),
        sa.Column('tone', sa.String(length=100), nullable=True),
        sa.Column('content_goals', sa.String(length=255), nullable=True),
        sa.Column('hook', sa.Text(), nullable=True),
        sa.Column('primary_keyword', sa.String(length=255), nullable=True),
        sa.Column('related_keywords', sa.Text(), nullable=True),
        sa.Column('call_to_action', sa.Text(), nullable=True),
        sa.Column('estimated_score', sa.Float(), nullable=True),
        sa.Column('angle', sa.String(length=255), nullable=True),
        sa.Column('is_favorite', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='active', nullable=False),
        sa.Column('seo_data', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_video_ideas_user_id'), 'video_ideas', ['user_id'], unique=False)
    op.create_index(op.f('ix_video_ideas_channel_id'), 'video_ideas', ['channel_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_video_ideas_channel_id'), table_name='video_ideas')
    op.drop_index(op.f('ix_video_ideas_user_id'), table_name='video_ideas')
    op.drop_table('video_ideas')
