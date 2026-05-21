"""QuantumNodes internal MCP server — exposes platform tools to Claude."""
from .platform_mcp import create_platform_mcp

__all__ = ["create_platform_mcp"]
