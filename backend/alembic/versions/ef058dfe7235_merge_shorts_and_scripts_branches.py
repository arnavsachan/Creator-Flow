"""merge_shorts_and_scripts_branches

Revision ID: ef058dfe7235
Revises: e8b2f91a4c30, f9a23b4c5d6e
Create Date: 2026-10-23 02:33:09.016814

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ef058dfe7235'
down_revision: Union[str, Sequence[str], None] = ('e8b2f91a4c30', 'f9a23b4c5d6e')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
