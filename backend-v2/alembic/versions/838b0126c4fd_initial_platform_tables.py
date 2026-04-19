"""initial_platform_tables

Creates transactional tables for platform identity, workflow definitions, and peer enrollments.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "838b0126c4fd"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("external_subject", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_platform_users"),
        sa.UniqueConstraint("external_subject", name="uq_platform_users_external_subject"),
        sa.UniqueConstraint("email", name="uq_platform_users_email"),
    )
    op.create_table(
        "workflow_definitions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("owner_user_id", sa.String(length=64), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["platform_users.id"],
            name="fk_workflow_definitions_owner_user_id_platform_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_workflow_definitions"),
        sa.UniqueConstraint("slug", name="uq_workflow_definitions_slug"),
    )
    op.create_table(
        "peer_enrollments",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("peer_id", sa.String(length=255), nullable=False),
        sa.Column("owner_user_id", sa.String(length=64), nullable=True),
        sa.Column("trust_tier", sa.String(length=32), nullable=False),
        sa.Column("enrollment_status", sa.String(length=32), nullable=False),
        sa.Column(
            "published_service_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "capability_summary",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["platform_users.id"],
            name="fk_peer_enrollments_owner_user_id_platform_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_peer_enrollments"),
        sa.UniqueConstraint("peer_id", name="uq_peer_enrollments_peer_id"),
    )


def downgrade() -> None:
    op.drop_table("peer_enrollments")
    op.drop_table("workflow_definitions")
    op.drop_table("platform_users")
