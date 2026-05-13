from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import YoutubeChannel
from schemas import YoutubeChannelCreate, YoutubeChannelOut

router = APIRouter(prefix="/youtube-channels", tags=["youtube"])


@router.get("", response_model=list[YoutubeChannelOut])
def get_channels(category: str | None = None, db: Session = Depends(get_db)):
    q = db.query(YoutubeChannel)
    if category:
        q = q.filter(YoutubeChannel.category == category)
    return q.order_by(YoutubeChannel.category.asc(), YoutubeChannel.channel_name.asc()).all()


@router.post("", response_model=YoutubeChannelOut, status_code=201)
def create_channel(body: YoutubeChannelCreate, db: Session = Depends(get_db)):
    row = YoutubeChannel(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{channel_id}", status_code=204)
def delete_channel(channel_id: int, db: Session = Depends(get_db)):
    row = db.get(YoutubeChannel, channel_id)
    if not row:
        raise HTTPException(status_code=404, detail="Channel not found")
    db.delete(row)
    db.commit()
