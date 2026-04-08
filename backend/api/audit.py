from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from audit.log import count_audit_events, query_audit_log
from auth.middleware import AuthenticatedUser, get_current_user
from auth.rbac import check_permission

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEvent(BaseModel):
    id: int
    ts: int
    actor_id: Optional[str]
    actor_username: Optional[str]
    action: str
    resource: Optional[str]
    outcome: str
    ip_address: Optional[str]
    metadata: Optional[Dict[str, Any]]


class AuditLogResponse(BaseModel):
    events: List[AuditEvent]
    total: int
    limit: int
    offset: int


@router.get("/log", response_model=AuditLogResponse)
async def get_audit_log(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    action: Optional[str] = Query(default=None, description="Filter by action substring"),
    actor: Optional[str] = Query(default=None, description="Filter by actor ID or username"),
    outcome: Optional[str] = Query(default=None, description="Filter by outcome: success|denied|error"),
    since: Optional[int] = Query(default=None, description="Unix timestamp ms lower bound"),
    until: Optional[int] = Query(default=None, description="Unix timestamp ms upper bound"),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuditLogResponse:
    if not check_permission(current_user.permissions, "audit:read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: audit:read",
        )

    events = await query_audit_log(
        limit=limit,
        offset=offset,
        action_filter=action,
        actor_filter=actor,
        outcome_filter=outcome,
        since_ts=since,
        until_ts=until,
    )
    total = await count_audit_events(action_filter=action)

    return AuditLogResponse(
        events=[AuditEvent(**e) for e in events],
        total=total,
        limit=limit,
        offset=offset,
    )
