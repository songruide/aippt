"""add project theme_overrides

Revision ID: a1b2c3d4e5f6
Revises: 11425e70d184
Create Date: 2026-08-06 17:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "11425e70d184"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "theme_overrides",
            sa.JSON(),
            server_default=sa.text("(JSON_OBJECT())"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "theme_overrides")
