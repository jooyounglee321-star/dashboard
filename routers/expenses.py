from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Expense, User
from routers.auth import get_current_user
from schemas import ExpenseCreate, ExpenseOut

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("", response_model=list[ExpenseOut])
def get_expenses(
    date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Expense).filter(Expense.user_id == current_user.id)
    if date:
        q = q.filter(Expense.date == date)
    return q.order_by(Expense.date.desc(), Expense.created_at.desc()).all()


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(
    body: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    data["user_id"] = current_user.id
    row = Expense(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Expense, expense_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(row)
    db.commit()
