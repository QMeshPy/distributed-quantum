"""
Services Package

Business logic and external integrations for the quantum backend.

Imports are lazy so lightweight modules (e.g. ens_service) can be tested
without pulling AgentKit / Beanie at package import time.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .agentkit_service import AgentKitService
    from .ai_agent_service import AIAgentService
    from .ens_service import EnsService
    from .marketplace_service import MarketplaceService
    from .notification_service import NotificationService
    from .proposal_service import ProposalService

__all__ = [
    "AgentKitService",
    "AIAgentService",
    "EnsService",
    "MarketplaceService",
    "NotificationService",
    "ProposalService",
    "get_ens_service",
    "get_notification_service",
    "set_ens_service",
    "set_notification_service",
]


def __getattr__(name: str) -> Any:
    if name == "AgentKitService":
        from .agentkit_service import AgentKitService

        return AgentKitService
    if name == "AIAgentService":
        from .ai_agent_service import AIAgentService

        return AIAgentService
    if name in {"EnsService", "get_ens_service", "set_ens_service"}:
        from . import ens_service as _ens

        return getattr(_ens, name)
    if name == "MarketplaceService":
        from .marketplace_service import MarketplaceService

        return MarketplaceService
    if name in {
        "NotificationService",
        "get_notification_service",
        "set_notification_service",
    }:
        from . import notification_service as _notif

        return getattr(_notif, name)
    if name == "ProposalService":
        from .proposal_service import ProposalService

        return ProposalService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
