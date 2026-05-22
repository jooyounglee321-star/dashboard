from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import YoutubeChannel, User
from routers.auth import get_current_user
from schemas import YoutubeChannelCreate, YoutubeChannelOut

router = APIRouter(prefix="/youtube-channels", tags=["youtube"])


@router.get("", response_model=list[YoutubeChannelOut])
def get_channels(
    category: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(YoutubeChannel).filter(YoutubeChannel.user_id == current_user.id)
    if category:
        q = q.filter(YoutubeChannel.category == category)
    return q.order_by(YoutubeChannel.category.asc(), YoutubeChannel.channel_name.asc()).all()


@router.post("", response_model=YoutubeChannelOut, status_code=201)
def create_channel(
    body: YoutubeChannelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    data["user_id"] = current_user.id
    row = YoutubeChannel(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{channel_id}", status_code=204)
def delete_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(YoutubeChannel, channel_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Channel not found")
    db.delete(row)
    db.commit()
