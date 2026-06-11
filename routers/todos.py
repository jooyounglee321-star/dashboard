import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Todo, User
from routers.auth import get_current_user
from schemas import TodoCheckToggle, TodoCreate, TodoOut

router = APIRouter(prefix="/todos", tags=["todos"])


@router.get("", response_model=list[TodoOut])
def list_todos(
    date_str: str = Query(alias="date", default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target: date = date.fromisoformat(date_str) if date_str else date.today()
    rows = (
        db.query(Todo)
        .filter(
            Todo.user_id == current_user.id,
            # start_date 조건: null이거나 start_date <= target
            (Todo.start_date == None) | (Todo.start_date <= target),  # noqa: E711
            # due_date 조건: null이거나 due_date >= target
            (Todo.due_date == None) | (Todo.due_date >= target),      # noqa: E711
        )
        .order_by(Todo.created_at.asc())
        .all()
    )
    result = []
    for row in rows:
        try:
            done_dates = json.loads(row.is_done_dates or "[]")
        except (ValueError, TypeError):
            done_dates = []
        result.append(TodoOut(
            id=row.id,
            title=row.title,
            start_date=row.start_date,
            due_date=row.due_date,
            is_done_dates=done_dates,
            created_at=row.created_at,
        ))
    return result


@router.post("", response_model=TodoOut, status_code=201)
def create_todo(
    body: TodoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = Todo(
        user_id=current_user.id,
        title=body.title.strip(),
        start_date=body.start_date,
        due_date=body.due_date,
        is_done_dates="[]",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return TodoOut(
        id=row.id, title=row.title,
        start_date=row.start_date, due_date=row.due_date,
        is_done_dates=[], created_at=row.created_at,
    )


@router.put("/{todo_id}/check", response_model=TodoOut)
def toggle_check(
    todo_id: int,
    body: TodoCheckToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Todo, todo_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Todo not found")
    try:
        done_dates: list[str] = json.loads(row.is_done_dates or "[]")
    except (ValueError, TypeError):
        done_dates = []
    if body.checked and body.date not in done_dates:
        done_dates.append(body.date)
    elif not body.checked and body.date in done_dates:
        done_dates.remove(body.date)
    row.is_done_dates = json.dumps(done_dates)
    db.commit()
    db.refresh(row)
    return TodoOut(
        id=row.id, title=row.title,
        start_date=row.start_date, due_date=row.due_date,
        is_done_dates=done_dates, created_at=row.created_at,
    )


@router.delete("/{todo_id}", status_code=204)
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Todo, todo_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(row)
    db.commit()
