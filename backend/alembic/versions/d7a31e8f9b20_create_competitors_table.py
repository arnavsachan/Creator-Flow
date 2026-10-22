"""create_competitors_table

Revision ID: d7a31e8f9b20
Revises: c5e91f0b1234
Create Date: 2026-10-22 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7a31e8f9b20'
down_revision: Union[str, Sequence[str], None] = 'c5e91f0b1234'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'competitors',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('channel_id', sa.String(length=100), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('custom_url', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('thumbnail_url', sa.String(length=1024), nullable=True),
        sa.Column('subscriber_count', sa.BigInteger(), nullable=True),
        sa.Column('hidden_subscriber_count', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('video_count', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('view_count', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('primary_channel_id', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'channel_id', name='uq_competitors_user_channel'),
    )
    op.create_index(op.f('ix_competitors_user_id'), 'competitors', ['user_id'], unique=False)
    op.create_index(op.f('ix_competitors_channel_id'), 'competitors', ['channel_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_competitors_channel_id'), table_name='competitors')
    op.drop_index(op.f('ix_competitors_user_id'), table_name='competitors')
    op.drop_table('competitors')
