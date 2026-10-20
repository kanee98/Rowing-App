from typing import List, Optional, Set, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user, require_roles
from app.models.models import User, UserRole, TaxonomyNode, TaxonomyNodeStatus
from app.schemas.schemas import (
    TaxonomyNodeOut, TaxonomyNodeTree, TaxonomyNodeCreate, TaxonomyNodeUpdate,
    TaxonomyNodeMove, TaxonomyReorderRequest
)

router = APIRouter(prefix="/taxonomy", tags=["taxonomy"])

def get_node_ancestor_ids(node_id: int, db: Session) -> Set[int]:
    """Retrieve all ancestor IDs of a node up to root"""
    ancestors = set()
    current = db.query(TaxonomyNode).filter(TaxonomyNode.id == node_id).first()
    while current and current.parent_id:
        ancestors.add(current.parent_id)
        current = db.query(TaxonomyNode).filter(TaxonomyNode.id == current.parent_id).first()
    return ancestors

def get_node_descendant_ids(node_id: int, club_id: int, db: Session) -> Set[int]:
    """Retrieve all descendant IDs of a node recursively"""
    descendants = set()
    queue = [node_id]
    while queue:
        curr_id = queue.pop(0)
        children = db.query(TaxonomyNode.id).filter(
            TaxonomyNode.parent_id == curr_id,
            TaxonomyNode.club_id == club_id,
            TaxonomyNode.status != TaxonomyNodeStatus.SOFT_DELETED
        ).all()
        for (c_id,) in children:
            if c_id not in descendants:
                descendants.add(c_id)
                queue.append(c_id)
    return descendants

def compute_node_full_path(node: TaxonomyNode, db: Session) -> str:
    """Compute breadcrumb path string: Root / Child / Leaf"""
    names = [node.name]
    current = node
    while current and current.parent_id:
        parent = db.query(TaxonomyNode).filter(TaxonomyNode.id == current.parent_id).first()
        if parent:
            names.insert(0, parent.name)
            current = parent
        else:
            break
    return " / ".join(names)

def compute_node_depth(node: TaxonomyNode, db: Session) -> int:
    depth = 0
    current = node
    while current and current.parent_id:
        depth += 1
        current = db.query(TaxonomyNode).filter(TaxonomyNode.id == current.parent_id).first()
    return depth

def build_tree_structure(
    nodes: List[TaxonomyNode],
    parent_id: Optional[int] = None,
    parent_path: str = "",
    depth: int = 0
) -> List[TaxonomyNodeTree]:
    """Recursively build taxonomy tree with full paths"""
    children = [n for n in nodes if n.parent_id == parent_id]
    children.sort(key=lambda x: (x.display_order, x.name.lower()))

    result = []
    for c in children:
        current_path = f"{parent_path} / {c.name}" if parent_path else c.name
        child_trees = build_tree_structure(
            nodes=nodes,
            parent_id=c.id,
            parent_path=current_path,
            depth=depth + 1
        )
        result.append(TaxonomyNodeTree(
            id=c.id,
            club_id=c.club_id,
            parent_id=c.parent_id,
            name=c.name,
            description=c.description,
            display_order=c.display_order,
            status=c.status,
            full_path=current_path,
            depth=depth,
            children=child_trees
        ))
    return result

@router.get("/tree", response_model=List[TaxonomyNodeTree])
def get_taxonomy_tree(
    include_archived: bool = Query(False),
    include_deleted: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve full hierarchical taxonomy tree for the authenticated user's club"""
    query = db.query(TaxonomyNode).filter(TaxonomyNode.club_id == current_user.club_id)
    
    if not include_deleted:
        query = query.filter(TaxonomyNode.status != TaxonomyNodeStatus.SOFT_DELETED)
    if not include_archived:
        query = query.filter(TaxonomyNode.status != TaxonomyNodeStatus.ARCHIVED)

    nodes = query.all()
    return build_tree_structure(nodes=nodes, parent_id=None, parent_path="", depth=0)

@router.get("/nodes", response_model=List[TaxonomyNodeOut])
def get_selectable_nodes(
    include_archived: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve flat list of selectable taxonomy nodes with formatted full paths and depths"""
    query = db.query(TaxonomyNode).filter(
        TaxonomyNode.club_id == current_user.club_id,
        TaxonomyNode.status != TaxonomyNodeStatus.SOFT_DELETED
    )
    if not include_archived:
        query = query.filter(TaxonomyNode.status == TaxonomyNodeStatus.ACTIVE)

    nodes = query.order_by(TaxonomyNode.display_order, TaxonomyNode.name).all()
    
    # Enrich with path and depth
    result = []
    for n in nodes:
        no = TaxonomyNodeOut.model_validate(n)
        no.full_path = compute_node_full_path(n, db)
        no.depth = compute_node_depth(n, db)
        result.append(no)

    result.sort(key=lambda x: x.full_path or x.name)
    return result

@router.post("/nodes", response_model=TaxonomyNodeOut, status_code=status.HTTP_201_CREATED)
def create_taxonomy_node(
    payload: TaxonomyNodeCreate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    """Create a new taxonomy root or child node"""
    # If parent_id provided, verify it exists and belongs to the same club
    if payload.parent_id:
        parent = db.query(TaxonomyNode).filter(
            TaxonomyNode.id == payload.parent_id,
            TaxonomyNode.club_id == current_user.club_id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent taxonomy node not found")
        if parent.status != TaxonomyNodeStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Cannot create children under an archived or deleted node")

    # Check sibling name uniqueness
    duplicate = db.query(TaxonomyNode).filter(
        TaxonomyNode.club_id == current_user.club_id,
        TaxonomyNode.parent_id == payload.parent_id,
        TaxonomyNode.name.ilike(payload.name.strip()),
        TaxonomyNode.status != TaxonomyNodeStatus.SOFT_DELETED
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail=f"A node named '{payload.name}' already exists at this hierarchy level."
        )

    # Determine display order if not given
    display_order = payload.display_order
    if display_order == 0:
        max_order = db.query(TaxonomyNode.display_order).filter(
            TaxonomyNode.club_id == current_user.club_id,
            TaxonomyNode.parent_id == payload.parent_id
        ).order_by(TaxonomyNode.display_order.desc()).first()
        display_order = (max_order[0] + 10) if max_order else 10

    node = TaxonomyNode(
        club_id=current_user.club_id,
        parent_id=payload.parent_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        display_order=display_order,
        status=TaxonomyNodeStatus.ACTIVE,
        created_by_id=current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(node)
    db.commit()
    db.refresh(node)

    out = TaxonomyNodeOut.model_validate(node)
    out.full_path = compute_node_full_path(node, db)
    out.depth = compute_node_depth(node, db)
    return out

@router.put("/nodes/{node_id}", response_model=TaxonomyNodeOut)
def update_taxonomy_node(
    node_id: int,
    payload: TaxonomyNodeUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    """Update node name, description, or display order"""
    node = db.query(TaxonomyNode).filter(
        TaxonomyNode.id == node_id,
        TaxonomyNode.club_id == current_user.club_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Taxonomy node not found")
    if node.status == TaxonomyNodeStatus.SOFT_DELETED:
        raise HTTPException(status_code=400, detail="Cannot edit a deleted node. Recover it first.")

    if payload.name and payload.name.strip() != node.name:
        # Check sibling uniqueness
        duplicate = db.query(TaxonomyNode).filter(
            TaxonomyNode.club_id == current_user.club_id,
            TaxonomyNode.parent_id == node.parent_id,
            TaxonomyNode.id != node.id,
            TaxonomyNode.name.ilike(payload.name.strip()),
            TaxonomyNode.status != TaxonomyNodeStatus.SOFT_DELETED
        ).first()
        if duplicate:
            raise HTTPException(
                status_code=400,
                detail=f"A sibling node named '{payload.name}' already exists."
            )
        node.name = payload.name.strip()

    if payload.description is not None:
        node.description = payload.description.strip() if payload.description else None
    if payload.display_order is not None:
        node.display_order = payload.display_order

    node.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(node)

    out = TaxonomyNodeOut.model_validate(node)
    out.full_path = compute_node_full_path(node, db)
    out.depth = compute_node_depth(node, db)
    return out

@router.post("/nodes/{node_id}/move", response_model=TaxonomyNodeOut)
def move_taxonomy_node(
    node_id: int,
    payload: TaxonomyNodeMove,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    """Move a taxonomy node to a new parent with cycle detection"""
    node = db.query(TaxonomyNode).filter(
        TaxonomyNode.id == node_id,
        TaxonomyNode.club_id == current_user.club_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Taxonomy node not found")

    target_parent_id = payload.target_parent_id

    if target_parent_id == node.id:
        raise HTTPException(status_code=400, detail="Cannot move a node beneath itself.")

    if target_parent_id is not None:
        target_parent = db.query(TaxonomyNode).filter(
            TaxonomyNode.id == target_parent_id,
            TaxonomyNode.club_id == current_user.club_id
        ).first()
        if not target_parent:
            raise HTTPException(status_code=404, detail="Target parent node not found")
        if target_parent.status != TaxonomyNodeStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Cannot move beneath an archived or deleted node")

        # Cycle prevention check: target_parent cannot be any descendant of node
        descendant_ids = get_node_descendant_ids(node.id, current_user.club_id, db)
        if target_parent_id in descendant_ids:
            raise HTTPException(
                status_code=400,
                detail="Cycle detected: Cannot move a parent node beneath one of its own descendants."
            )

    node.parent_id = target_parent_id
    if payload.display_order is not None:
        node.display_order = payload.display_order
    node.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(node)

    out = TaxonomyNodeOut.model_validate(node)
    out.full_path = compute_node_full_path(node, db)
    out.depth = compute_node_depth(node, db)
    return out

@router.post("/reorder", response_model=dict)
def reorder_taxonomy_nodes(
    payload: TaxonomyReorderRequest,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    """Batch reorder sibling nodes transactionally"""
    for item in payload.items:
        node = db.query(TaxonomyNode).filter(
            TaxonomyNode.id == item.id,
            TaxonomyNode.club_id == current_user.club_id
        ).first()
        if node:
            node.display_order = item.display_order
            node.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": f"Updated display order for {len(payload.items)} nodes."}

@router.post("/nodes/{node_id}/archive", response_model=TaxonomyNodeOut)
def archive_taxonomy_node(
    node_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    """Archive a taxonomy node (excluded from new selections, historical reads preserved)"""
    node = db.query(TaxonomyNode).filter(
        TaxonomyNode.id == node_id,
        TaxonomyNode.club_id == current_user.club_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Taxonomy node not found")

    node.status = TaxonomyNodeStatus.ARCHIVED
    node.archived_at = datetime.utcnow()
    node.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(node)

    out = TaxonomyNodeOut.model_validate(node)
    out.full_path = compute_node_full_path(node, db)
    out.depth = compute_node_depth(node, db)
    return out

@router.post("/nodes/{node_id}/restore", response_model=TaxonomyNodeOut)
def restore_taxonomy_node(
    node_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    """Restore an archived node back to active"""
    node = db.query(TaxonomyNode).filter(
        TaxonomyNode.id == node_id,
        TaxonomyNode.club_id == current_user.club_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Taxonomy node not found")

    node.status = TaxonomyNodeStatus.ACTIVE
    node.archived_at = None
    node.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(node)

    out = TaxonomyNodeOut.model_validate(node)
    out.full_path = compute_node_full_path(node, db)
    out.depth = compute_node_depth(node, db)
    return out

@router.delete("/nodes/{node_id}", response_model=dict)
def soft_delete_taxonomy_node(
    node_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.COACH])),
    db: Session = Depends(get_db)
):
    """Soft delete a taxonomy node (only tenant administrators can recover)"""
    node = db.query(TaxonomyNode).filter(
        TaxonomyNode.id == node_id,
        TaxonomyNode.club_id == current_user.club_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Taxonomy node not found")

    # Soft delete this node and its descendants
    descendants = get_node_descendant_ids(node.id, current_user.club_id, db)
    all_target_ids = list(descendants) + [node.id]

    now = datetime.utcnow()
    db.query(TaxonomyNode).filter(
        TaxonomyNode.id.in_(all_target_ids)
    ).update({
        "status": TaxonomyNodeStatus.SOFT_DELETED,
        "deleted_at": now,
        "updated_at": now
    }, synchronize_session=False)

    db.commit()
    return {
        "status": "success",
        "deleted_node_id": node_id,
        "affected_count": len(all_target_ids),
        "message": f"Soft deleted node '{node.name}' and {len(descendants)} descendants."
    }

@router.post("/nodes/{node_id}/recover", response_model=TaxonomyNodeOut)
def recover_taxonomy_node(
    node_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Recover a soft-deleted node (Restricted to Tenant Administrator)"""
    node = db.query(TaxonomyNode).filter(
        TaxonomyNode.id == node_id,
        TaxonomyNode.club_id == current_user.club_id
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Taxonomy node not found")

    node.status = TaxonomyNodeStatus.ACTIVE
    node.deleted_at = None
    node.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(node)

    out = TaxonomyNodeOut.model_validate(node)
    out.full_path = compute_node_full_path(node, db)
    out.depth = compute_node_depth(node, db)
    return out
