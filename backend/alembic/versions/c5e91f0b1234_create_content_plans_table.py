"""create_content_plans_table

Revision ID: c5e91f0b1234
Revises: b41f71a9e201
Create Date: 2026-10-21 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5e91f0b1234'
down_revision: Union[str, Sequence[str], None] = 'b41f71a9e201'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'content_plans',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('channel_id', sa.String(length=100), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('content_type', sa.String(length=50), nullable=False, server_default='Long-form'),
        sa.Column('platform', sa.String(length=50), nullable=False, server_default='youtube'),
        sa.Column('stage', sa.String(length=50), nullable=False, server_default='Idea'),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('video_id', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_content_plans_user_id'), 'content_plans', ['user_id'], unique=False)
    op.create_index(op.f('ix_content_plans_channel_id'), 'content_plans', ['channel_id'], unique=False)
    op.create_index(op.f('ix_content_plans_stage'), 'content_plans', ['stage'], unique=False)
    op.create_index(op.f('ix_content_plans_scheduled_at'), 'content_plans', ['scheduled_at'], unique=False)
    op.create_index(op.f('ix_content_plans_video_id'), 'content_plans', ['video_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_content_plans_video_id'), table_name='content_plans')
    op.drop_index(op.f('ix_content_plans_scheduled_at'), table_name='content_plans')
    op.drop_index(op.f('ix_content_plans_stage'), table_name='content_plans')
    op.drop_index(op.f('ix_content_plans_channel_id'), table_name='content_plans')
    op.drop_index(op.f('ix_content_plans_user_id'), table_name='content_plans')
    op.drop_table('content_plans')
