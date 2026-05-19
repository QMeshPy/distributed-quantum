from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json


class ConnectionManager:
    """
    Manages WebSocket connections for real-time agent updates.

    Allows multiple WebSocket connections per session (e.g., multiple browser tabs).
    Handles connection lifecycle and message broadcasting.
    """

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        """
        Accept WebSocket connection for a session.

        Args:
            session_id: Session ID to connect to
            websocket: WebSocket connection to accept
        """
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        self.active_connections[session_id].add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        """
        Remove WebSocket connection.

        Args:
            session_id: Session ID to disconnect from
            websocket: WebSocket connection to remove
        """
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def send_message(self, session_id: str, message: dict):
        """
        Send message to all connections for a session.

        Args:
            session_id: Session ID to send to
            message: Message dictionary to send (will be JSON-encoded)
        """
        if session_id in self.active_connections:
            dead_connections = set()
            for connection in self.active_connections[session_id]:
                try:
                    await connection.send_json(message)
                except:
                    dead_connections.add(connection)

            # Clean up dead connections
            for conn in dead_connections:
                self.disconnect(session_id, conn)

    async def broadcast_status(self, session_id: str, status: str, data: dict = None):
        """
        Broadcast status update to all connections for a session.

        Args:
            session_id: Session ID to broadcast to
            status: Status message type (e.g., "thinking", "executing", "completed")
            data: Additional data to include in the message
        """
        message = {
            "type": "status",
            "status": status,
            "data": data or {}
        }
        await self.send_message(session_id, message)

    async def broadcast_progress(self, session_id: str, step: str, progress: int, message: str = None):
        """
        Broadcast progress update to all connections for a session.

        Args:
            session_id: Session ID to broadcast to
            step: Current step name
            progress: Progress percentage (0-100)
            message: Optional progress message
        """
        msg = {
            "type": "progress",
            "step": step,
            "progress": progress,
            "message": message
        }
        await self.send_message(session_id, msg)

    async def broadcast_log(self, session_id: str, level: str, message: str):
        """
        Broadcast log message to all connections for a session.

        Args:
            session_id: Session ID to broadcast to
            level: Log level (info, warning, error, debug)
            message: Log message
        """
        msg = {
            "type": "log",
            "level": level,
            "message": message
        }
        await self.send_message(session_id, msg)

    def get_connection_count(self, session_id: str) -> int:
        """
        Get number of active connections for a session.

        Args:
            session_id: Session ID to check

        Returns:
            Number of active connections
        """
        if session_id in self.active_connections:
            return len(self.active_connections[session_id])
        return 0


# Global connection manager instance
manager = ConnectionManager()
