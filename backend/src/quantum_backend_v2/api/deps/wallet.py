"""One wallet service per application, using its validated chain configuration."""

from typing import Annotated

from fastapi import Depends, FastAPI, Request

from services.agentkit_service import AgentKitService


def build_wallet_service(app: FastAPI) -> AgentKitService:
    """The app's wallet service, created on first use."""
    service = getattr(app.state, "wallet_service", None)
    if service is None:
        service = AgentKitService(
            registry=app.state.chain_registry,
            network=app.state.wallet_chain_id,
        )
        app.state.wallet_service = service
    return service


async def get_wallet_service(request: Request) -> AgentKitService:
    return build_wallet_service(request.app)


WalletService = Annotated[AgentKitService, Depends(get_wallet_service)]
