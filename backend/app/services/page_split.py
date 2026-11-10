"""溢出自动分页：一页装不下时把内容拆成两页，而不是压到画布外。

PPT 是固定画布，没有滚动；能同时保住内容与版面的做法只有「拆页」。
拆分规则刻意保守：

- 只拆 flex 页（固定布局的槽位由版式决定，拆了就不是那个版式了）；
- 标题类块（kicker / title / lead）留在第一页，续页复制标题并加「（续）」；
- 内容块按原顺序贪心装填，装到安全区放不下为止，剩下的整体挪到续页；
- 至少要有 1 个块被留下、1 个块被挪走，否则不拆（说明单块本身超高）。
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from app.domain.content import Block, Slide
from app.domain.flex_fit import _FitContext, _natural_height_pt, fit_tree_to_content
from app.domain.flex_layout import FlexContainer, FlexLeaf
from app.domain.flex_normalize import TITLE_STYLES
from app.domain.flex_presets import (
    BlockRef,
    alternate_preset_trees,
    seed_layout_for_blocks,
)
from app.domain.flex_solve import solve
from app.domain.flex_width import fit_row_widths
from app.domain.geometry import CANVAS_WIDTH_PT, SAFE_AREA_HEIGHT_PT
from app.domain.theme import Theme

logger = logging.getLogger(__name__)

# 超过安全区这个比例才拆页：轻微超出只留告警，避免为几 pt 拆出一页
SPLIT_THRESHOLD = 1.05

# 图片/图表是「可压缩」的视觉块：排版求解允许它们比偏好高度矮很多，
# 判断是否真的装不下时要按可接受下限算，否则每页带图的正常页面都会被误判。
_MIN_VISUAL_HEIGHT_PT = 96.0


@dataclass(frozen=True)
class SplitPlan:
    kept_blocks: list[Block]
    kept_tree: FlexContainer
    moved_blocks: list[Block]
    moved_tree: FlexContainer


def overflow_ratio(slide: Slide, theme: Theme) -> float:
    """整页自然高度相对安全区的倍数；非 flex 页返回 0。"""
    if slide.layout_mode != "flex" or slide.layout_tree is None:
        return 0.0
    widths = {
        placed.block_id: placed.rect.w * CANVAS_WIDTH_PT for placed in solve(slide.layout_tree)
    }
    ctx = _FitContext(
        block_map={block.id: block for block in slide.blocks},
        widths_pt=widths,
        theme=theme,
    )
    return _minimum_height_pt(slide.layout_tree, ctx) / SAFE_AREA_HEIGHT_PT


def plan_overflow_split(
    slide: Slide,
    theme: Theme,
    *,
    page_role: str,
    moved_prefix: str,
    continuation_title: str,
) -> SplitPlan | None:
    """把超高的 flex 页拆成两页；不需要或拆不动时返回 None。"""
    if overflow_ratio(slide, theme) <= SPLIT_THRESHOLD:
        return None

    tree = slide.layout_tree
    if tree is None:
        return None

    leaves = _ordered_leaves(tree)
    block_map = {block.id: block for block in slide.blocks}

    header: list[Block] = []
    content: list[Block] = []
    for leaf in leaves:
        block = block_map.get(leaf.block_id)
        if block is None:
            continue
        if leaf.text_style in TITLE_STYLES:
            header.append(block)
        else:
            content.append(block)

    if len(content) < 2:
        # 只剩一个内容块还超高，拆了也是两页都超，没有意义
        return None

    # 重建后的树会换版式，块高度跟着变，所以不能只按原树估算：
    # 从「尽量多留」往回收，直到第一页真的落回安全区。
    for keep_count in range(len(content) - 1, 0, -1):
        kept_blocks, kept_tree = _fit_blocks(
            header + content[:keep_count], theme=theme, page_role=page_role
        )
        if _tree_ratio(kept_blocks, kept_tree, theme) > 1.0:
            continue
        moved_blocks, moved_tree = _fit_blocks(
            [_continuation_title_block(moved_prefix, continuation_title)]
            + [_reprefix(block, moved_prefix) for block in content[keep_count:]],
            theme=theme,
            page_role=page_role,
        )
        return SplitPlan(
            kept_blocks=kept_blocks,
            kept_tree=kept_tree,
            moved_blocks=moved_blocks,
            moved_tree=moved_tree,
        )
    return None


def _tree_ratio(blocks: list[Block], tree: FlexContainer, theme: Theme) -> float:
    widths = {placed.block_id: placed.rect.w * CANVAS_WIDTH_PT for placed in solve(tree)}
    ctx = _FitContext(
        block_map={block.id: block for block in blocks}, widths_pt=widths, theme=theme
    )
    return _minimum_height_pt(tree, ctx) / SAFE_AREA_HEIGHT_PT


def _minimum_height_pt(node: FlexContainer | FlexLeaf, ctx: _FitContext) -> float:
    """版面真正需要的高度：视觉块可以压到下限，文字块必须给足。"""
    if isinstance(node, FlexLeaf):
        block = ctx.block_map.get(node.block_id)
        natural = _natural_height_pt(node, ctx)
        if block is not None and block.type in {"image", "chart"}:
            return min(natural, _MIN_VISUAL_HEIGHT_PT)
        return natural

    if not node.children:
        return 0.0
    heights = [_minimum_height_pt(child, ctx) for child in node.children]
    if node.type == "row":
        return max(heights)
    return sum(heights) + max(len(heights) - 1, 0) * node.gap_pt


def _ordered_leaves(tree: FlexContainer) -> list[FlexLeaf]:
    leaves: list[FlexLeaf] = []

    def walk(node: FlexContainer) -> None:
        for child in node.children:
            if isinstance(child, FlexLeaf):
                leaves.append(child)
            else:
                walk(child)

    walk(tree)
    return leaves


def _fit_blocks(
    blocks: list[Block], *, theme: Theme, page_role: str
) -> tuple[list[Block], FlexContainer]:
    """按块重新选树并跑宽度/高度修正，返回 (blocks, tree)。

    同一个块组合能套多种预设，套错版式（例如把一段长要点塞进半宽栏）
    会让拆完的页面依旧溢出。这里把种子树和备选预设都算一遍，取最矮的那棵。
    """
    refs = [BlockRef(id=block.id, type=block.type) for block in blocks]
    seed = seed_layout_for_blocks(refs, page_role=page_role)
    candidates = [seed, *alternate_preset_trees(refs, exclude_tree=seed, limit=2)]

    best: tuple[float, FlexContainer] | None = None
    for candidate in candidates:
        widened = fit_row_widths(candidate, blocks, theme=theme)
        fitted = fit_tree_to_content(widened, blocks, theme=theme, page_role=page_role)
        ratio = _tree_ratio(blocks, fitted, theme)
        if best is None or ratio < best[0]:
            best = (ratio, fitted)
    return blocks, (best[1] if best is not None else seed)


def _continuation_title_block(prefix: str, text: str) -> Block:
    from app.domain.content import TextBlock

    return TextBlock(id=f"{prefix}-title", slot_id=f"{prefix}-title", text=text)


def _reprefix(block: Block, prefix: str) -> Block:
    suffix = block.id.split("-")[-1]
    new_id = f"{prefix}-{suffix}"
    return block.model_copy(update={"id": new_id, "slot_id": new_id})


def new_split_prefix(slide_id: uuid.UUID) -> str:
    return str(slide_id)


async def split_overflowing_slide(project_id: uuid.UUID, slide_id: uuid.UUID) -> uuid.UUID | None:
    """把已生成但超高的页面拆成两页并落库，返回续页 id。

    续页内容直接复用原页的块，不再调模型：拆分是排版决策，不该再花一次推理。
    """
    from sqlalchemy import select

    from app.core.db import async_session_factory
    from app.domain.theme import resolve_project_theme
    from app.models.project import Project
    from app.services.deck import load_slides, refresh_slide_issues, to_content_slide
    from app.services.deck_pages import PageOperationError, insert_blank_page

    async with async_session_factory() as session:
        project = (
            await session.execute(
                select(Project).where(Project.id == project_id).with_for_update()
            )
        ).scalars().first()
        if project is None:
            return None

        slides = await load_slides(session, project.id)
        row = next((item for item in slides if item.id == slide_id), None)
        if row is None or row.status != "ready":
            return None

        theme = resolve_project_theme(project)
        content = to_content_slide(row)
        page_role = _page_role(project, row)
        continuation_title = f"{row.title}（续）"
        plan = plan_overflow_split(
            content,
            theme,
            page_role=page_role,
            moved_prefix=f"{slide_id}-b",
            continuation_title=continuation_title,
        )
        if plan is None:
            return None

        row.blocks = [block.model_dump(mode="json") for block in plan.kept_blocks]
        row.layout_tree = plan.kept_tree.model_dump(mode="json")
        row.layout_mode = "flex"
        row.revision += 1
        refresh_slide_issues(row, theme=theme)
        await session.commit()

        try:
            created = await insert_blank_page(session, project, slides, after=row)
        except PageOperationError:
            # 已经到页数上限，保持原样，交给溢出告警
            return None

        created.title = continuation_title
        created.layout_id = row.layout_id
        created.blocks = [block.model_dump(mode="json") for block in plan.moved_blocks]
        created.layout_tree = plan.moved_tree.model_dump(mode="json")
        created.layout_mode = "flex"
        created.status = "ready"
        created.error = None
        created.revision += 1
        refresh_slide_issues(created, theme=theme)
        _retitle_outline_page(project, created.outline_page_id, continuation_title, row.layout_id)
        await session.commit()
        logger.info(
            "自动分页：project=%s slide=%s → 续页=%s（保留 %d 块 / 移出 %d 块）",
            project_id,
            slide_id,
            created.id,
            len(plan.kept_blocks),
            len(plan.moved_blocks),
        )
        return created.id


def _page_role(project, row) -> str:
    outline = getattr(project, "outline", None)
    for page in getattr(outline, "pages", None) or []:
        if str(page.get("id")) == str(row.outline_page_id):
            return str(page.get("page_role") or "content")
    return "content"


def _retitle_outline_page(project, outline_page_id, title: str, layout_id: str) -> None:
    """续页在生成时按大纲页同步标题，大纲里的那条也要跟着改。"""
    outline = getattr(project, "outline", None)
    if outline is None:
        return
    pages = []
    for page in outline.pages or []:
        if str(page.get("id")) == str(outline_page_id):
            page = {**page, "title": title, "layout_id": layout_id}
        pages.append(page)
    # JSON 列需要整体赋值才会被 SQLAlchemy 标记为变更
    outline.pages = pages
