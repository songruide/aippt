"""LangSmith 链路追踪配置。

LangChain 判断是否上报 trace 时只读进程环境变量（``LANGSMITH_TRACING`` 等），
而本项目统一用 ``backend/.env`` + pydantic-settings 管配置，后者不会写入
``os.environ``。所以这里做一次显式桥接：把 Settings 里的 LangSmith 配置同步到
环境变量，模型调用才会真正上报。

必须早于第一次模型调用执行；API 进程与 ARQ Worker 进程各自调用一次。
"""

import logging
import os

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# 新变量名由 langchain-core 1.x 读取；旧名保留以兼容仍读旧值的依赖。
_ENV_KEYS = (
    "LANGSMITH_TRACING",
    "LANGSMITH_API_KEY",
    "LANGSMITH_PROJECT",
    "LANGSMITH_ENDPOINT",
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_API_KEY",
    "LANGCHAIN_PROJECT",
    "LANGCHAIN_ENDPOINT",
)


def configure_tracing() -> bool:
    """把 .env 中的 LangSmith 配置同步到 os.environ，返回追踪是否真正开启。

    开关打开但缺少 api_key 时视为未开启：与其让 LangChain 静默丢弃 trace，
    不如在这里明确降级，并在启动日志里说清楚原因。
    """
    settings = get_settings()
    api_key = settings.langsmith_api_key.strip()
    enabled = settings.langsmith_tracing and bool(api_key)

    if not enabled:
        # 清掉可能残留的值，避免上一次进程的配置造成误上报
        for key in _ENV_KEYS:
            os.environ.pop(key, None)
        if settings.langsmith_tracing and not api_key:
            logger.warning("已开启 LangSmith 追踪但未配置 LANGSMITH_API_KEY，追踪保持关闭")
        return False

    project = settings.langsmith_project.strip() or "default"
    endpoint = settings.langsmith_endpoint.strip() or "https://api.smith.langchain.com"
    os.environ.update(
        {
            "LANGSMITH_TRACING": "true",
            "LANGSMITH_API_KEY": api_key,
            "LANGSMITH_PROJECT": project,
            "LANGSMITH_ENDPOINT": endpoint,
            "LANGCHAIN_TRACING_V2": "true",
            "LANGCHAIN_API_KEY": api_key,
            "LANGCHAIN_PROJECT": project,
            "LANGCHAIN_ENDPOINT": endpoint,
        }
    )
    logger.info("LangSmith 追踪已开启，project=%s endpoint=%s", project, endpoint)
    return True
