"""create_shorts_jobs_and_clips_tables

Revision ID: e8b2f91a4c30
Revises: d7a31e8f9b20
Create Date: 2026-10-23 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8b2f91a4c30'
down_revision: Union[str, Sequence[str], None] = 'd7a31e8f9b20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'shorts_jobs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=255), nullable=True),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('stored_path', sa.String(length=1024), nullable=False),
        sa.Column('size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('duration_seconds', sa.Float(), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=32), server_default='uploaded', nullable=False),
        sa.Column('error_code', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_shorts_jobs_created_at'), 'shorts_jobs', ['created_at'], unique=False)

    op.create_table(
        'shorts_clips',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('job_id', sa.String(length=36), nullable=False),
        sa.Column('start_seconds', sa.Float(), nullable=False),
        sa.Column('end_seconds', sa.Float(), nullable=False),
        sa.Column('aspect', sa.String(length=32), server_default='original', nullable=False),
        sa.Column('status', sa.String(length=32), server_default='queued', nullable=False),
        sa.Column('error_code', sa.String(length=64), nullable=True),
        sa.Column('output_path', sa.String(length=1024), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['job_id'], ['shorts_jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_shorts_clips_job_id'), 'shorts_clips', ['job_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_shorts_clips_job_id'), table_name='shorts_clips')
    op.drop_table('shorts_clips')
    op.drop_index(op.f('ix_shorts_jobs_created_at'), table_name='shorts_jobs')
    op.drop_table('shorts_jobs')
