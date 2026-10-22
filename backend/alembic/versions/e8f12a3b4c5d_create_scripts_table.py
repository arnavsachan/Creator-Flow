"""create_scripts_table

Revision ID: e8f12a3b4c5d
Revises: d7a31e8f9b20
Create Date: 2026-10-22 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8f12a3b4c5d'
down_revision: Union[str, Sequence[str], None] = 'd7a31e8f9b20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'scripts',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('channel_id', sa.String(length=100), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('topic', sa.String(length=500), nullable=False),
        sa.Column('target_duration', sa.String(length=50), server_default='8m 00s', nullable=False),
        sa.Column('tone', sa.String(length=100), server_default='Conversational', nullable=False),
        sa.Column('audience_persona', sa.String(length=255), nullable=True),
        sa.Column('hook_type', sa.String(length=50), server_default='curiosity', nullable=False),
        sa.Column('hook_text', sa.Text(), nullable=True),
        sa.Column('full_script', sa.Text(), nullable=False),
        sa.Column('estimated_retention_score', sa.Float(), nullable=True),
        sa.Column('pacing_breakdown', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_scripts_user_id'), 'scripts', ['user_id'], unique=False)
    op.create_index(op.f('ix_scripts_channel_id'), 'scripts', ['channel_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_scripts_channel_id'), table_name='scripts')
    op.drop_index(op.f('ix_scripts_user_id'), table_name='scripts')
    op.drop_table('scripts')
