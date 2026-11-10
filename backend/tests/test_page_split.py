"""溢出自动分页：拆页后两页都要装得下，内容不能丢。"""

from __future__ import annotations

from app.domain.content import BulletsBlock, CardItem, CardsBlock, KpiBlock, Slide, TextBlock
from app.domain.flex_layout import FlexContainer, FlexLeaf
from app.domain.theme import get_theme
from app.services.page_split import overflow_ratio, plan_overflow_split

THEME = get_theme("ivory")

LONG = "声明变量先定类型：基本类型保存值，引用类型保存地址；比较内容用 equals，避免误用 =="


def _slide(items: list[str] | None = None) -> Slide:
    """复刻一页「标题 + 要点 + KPI + 三张卡」的拥挤版面。"""
    body = items if items is not None else [LONG] * 5
    return Slide(
        id="slide-1",
        layout_id="two-column",
        layout_mode="flex",
        blocks=[
            TextBlock(
                id="slide-1-title",
                slot_id="slide-1-title",
                text="基础语法：变量、流程控制与方法",
            ),
            BulletsBlock(id="slide-1-body", slot_id="slide-1-body", items=body),
            KpiBlock(
                id="slide-1-kpi",
                slot_id="slide-1-kpi",
                value="4",
                label="个语法模块",
                note="口径：按本页要点归纳为变量、流程控制、方法、数组",
            ),
            CardsBlock(
                id="slide-1-cards",
                slot_id="slide-1-cards",
                items=[
                    CardItem(title="变量：类型先行", desc="先声明类型再赋值，默认值只对成员变量生效。"),
                    CardItem(title="流程控制：边界优先", desc="写循环时先定终止条件，再检查空集合等边界。"),
                    CardItem(title="方法与数组：拆分", desc="用方法拆分逻辑；数组用 length 控制下标。"),
                ],
            ),
        ],
        layout_tree=FlexContainer(
            type="column",
            id="root",
            gap_pt=16.0,
            children=[
                FlexLeaf(id="leaf-title", block_id="slide-1-title", grow=0.6, text_style="title"),
                FlexLeaf(id="leaf-body", block_id="slide-1-body", grow=2.0, text_style="bullet"),
                FlexLeaf(id="leaf-kpi", block_id="slide-1-kpi", grow=0.8),
                FlexLeaf(id="leaf-cards", block_id="slide-1-cards", grow=1.6),
            ],
        ),
    )


def test_overflow_ratio_detects_overstuffed_page() -> None:
    assert overflow_ratio(_slide(), THEME) > 1.2
    assert overflow_ratio(_slide(["一句话", "两句话"]), THEME) < 1.0


def test_split_moves_content_to_a_second_page() -> None:
    slide = _slide()

    plan = plan_overflow_split(
        slide,
        THEME,
        page_role="content",
        moved_prefix="slide-2",
        continuation_title="基础语法（续）",
    )

    assert plan is not None
    assert plan.kept_blocks
    assert plan.moved_blocks
    # 内容不丢：原块全部落在两页里，续页多一个标题块
    assert len(plan.kept_blocks) + len(plan.moved_blocks) == len(slide.blocks) + 1

    kept = Slide(
        id="slide-1",
        layout_id="two-column",
        layout_mode="flex",
        blocks=plan.kept_blocks,
        layout_tree=plan.kept_tree,
    )
    moved = Slide(
        id="slide-2",
        layout_id="two-column",
        layout_mode="flex",
        blocks=plan.moved_blocks,
        layout_tree=plan.moved_tree,
    )
    # 第一页必须回到安全区内，续页要比原页轻
    assert overflow_ratio(kept, THEME) <= 1.05
    assert overflow_ratio(moved, THEME) < overflow_ratio(slide, THEME)


def test_split_keeps_title_and_appends_continuation_marker() -> None:
    plan = plan_overflow_split(
        _slide(),
        THEME,
        page_role="content",
        moved_prefix="slide-2",
        continuation_title="基础语法（续）",
    )

    assert plan is not None
    titles = [block for block in plan.moved_blocks if block.type == "text"]
    assert titles and "（续）" in titles[0].text


def test_short_page_is_not_split() -> None:
    plan = plan_overflow_split(
        _slide(["声明变量先定类型", "循环前明确终止条件"]),
        THEME,
        page_role="content",
        moved_prefix="slide-2",
        continuation_title="基础语法（续）",
    )

    assert plan is None
