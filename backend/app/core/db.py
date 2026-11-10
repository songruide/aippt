from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# connect_timeout 缩短探活失败等待，避免依赖不可达时长时间阻塞；
# pool_pre_ping 兜住 MySQL 8 小时空闲断连后拿到的失效连接。
engine = create_async_engine(
    settings.database_url,
    connect_args={"connect_timeout": 2},
    pool_pre_ping=True,
)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
