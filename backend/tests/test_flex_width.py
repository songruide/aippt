"""最小可读宽度：窄栏要么被同行的兄弟补回来，要么折成多行。"""

from __future__ import annotations

from app.domain.content import Block, BulletsBlock, CardItem, CardsBlock, ImageBlock, TextBlock
from app.domain.flex_layout import FlexContainer, FlexLeaf
from app.domain.flex_solve import solve
from app.domain.flex_width import MIN_CHARS_PER_LINE, fit_row_widths
from app.domain.geometry import CANVAS_WIDTH_PT
from app.domain.theme import get_theme

THEME = get_theme("ivory")
BODY_SIZE_PT = THEME.text_styles["body"].size_pt


def _cards(count: int) -> CardsBlock:
    return CardsBlock(
        id="cards",
        slot_id="body",
        items=[
            CardItem(title=f"支柱{index}", desc="通过持续复盘把经验固化成可复用的方法")
            for index in range(1, count + 1)
        ],
    )


def _widths_pt(tree: FlexContainer) -> dict[str, float]:
    return {p.block_id: p.rect.w * CANVAS_WIDTH_PT for p in solve(tree)}


def _leaf(block_id: str, *, grow: float = 1.0, text_style: str | None = None) -> FlexLeaf:
    return FlexLeaf(id=f"leaf-{block_id}", block_id=block_id, grow=grow, text_style=text_style)


def test_narrow_column_borrows_width_from_a_roomy_sibling() -> None:
    """左边一大段正文把右边挤到读不了，宽度应该从正文那边还回来。"""
    tree = FlexContainer(
        type="row",
        id="root",
        gap_pt=16.0,
        ratios=[67, 33],
        children=[_leaf("body", text_style="bullet"), _leaf("cards")],
    )
    blocks: list[Block] = [
        BulletsBlock(
            id="body",
            slot_id="body",
            items=["复盘的价值在于把一次性的经验变成可复用的判断依据。"],
        ),
        _cards(3),
    ]

    before = _widths_pt(tree)
    after = _widths_pt(fit_row_widths(tree, blocks, theme=THEME))
    assert after["cards"] > before["cards"]
    assert after["body"] < before["body"]


def test_four_narrow_cards_are_folded_into_two_rows() -> None:
    """右半幅摆不下四张卡就折成 2×2，而不是把每张压到几十 pt。"""
    tree = FlexContainer(
        type="row",
        id="root",
        gap_pt=16.0,
        ratios=[50, 50],
        children=[
            _leaf("body", text_style="bullet"),
            FlexContainer(
                type="row",
                id="cards-row",
                gap_pt=16.0,
                children=[_leaf(f"c{index}") for index in range(1, 5)],
            ),
        ],
    )
    blocks: list[Block] = [
        BulletsBlock(id="body", slot_id="body", items=["把一次性的经验固化成可复用的方法。"]),
        *(
            CardsBlock(
                id=f"c{index}",
                slot_id="body",
                items=[CardItem(title=f"支柱{index}", desc="持续复盘并沉淀为方法")],
            )
            for index in range(1, 5)
        ),
    ]

    before = _widths_pt(tree)
    after = _widths_pt(fit_row_widths(tree, blocks, theme=THEME))
    # 折行只改分组，块一个不少
    assert set(after) == set(before)
    for index in range(1, 5):
        assert after[f"c{index}"] > 1.5 * before[f"c{index}"]
    # 两行两列：四张卡两两同宽，且分成上下两组
    tops = {round(p.rect.y, 4) for p in solve(fit_row_widths(tree, blocks, theme=THEME))}
    assert len(tops) >= 2


def test_cards_wide_enough_are_left_alone() -> None:
    """够宽就不该动：这一步只补救读不了的窄栏，不去规定审美。"""
    tree = FlexContainer(
        type="column",
        id="root",
        gap_pt=16.0,
        children=[
            _leaf("title", grow=0.5, text_style="title"),
            FlexContainer(
                type="row",
                id="row",
                gap_pt=16.0,
                ratios=[50, 50],
                children=[_leaf("cards"), _leaf("pic")],
            ),
        ],
    )
    blocks: list[Block] = [
        TextBlock(id="title", slot_id="title", text="三个支柱"),
        _cards(2),
        ImageBlock(id="pic", slot_id="visual", alt="配图", source="placeholder", url=None),
    ]
    assert _widths_pt(fit_row_widths(tree, blocks, theme=THEME)) == _widths_pt(tree)


def test_text_column_gets_at_least_the_readable_minimum() -> None:
    """一行至少排得下 MIN_CHARS_PER_LINE 个全角字，否则中文只剩四五个字。"""
    tree = FlexContainer(
        type="row",
        id="root",
        gap_pt=16.0,
        ratios=[67, 33],
        children=[_leaf("pic"), _leaf("body", text_style="body")],
    )
    long_text = "复盘的价值在于把一次性的经验变成可复用的判断依据，而不是记录发生过什么。"
    blocks: list[Block] = [
        ImageBlock(id="pic", slot_id="visual", alt="配图", source="placeholder", url=None),
        TextBlock(id="body", slot_id="body", text=long_text),
    ]
    widths = _widths_pt(fit_row_widths(tree, blocks, theme=THEME))
    assert widths["body"] >= MIN_CHARS_PER_LINE * BODY_SIZE_PT


def test_unknown_block_ids_do_not_crash() -> None:
    tree = FlexContainer(
        type="row",
        id="root",
        gap_pt=16.0,
        children=[_leaf("ghost"), _leaf("body")],
    )
    fitted = fit_row_widths(tree, [], theme=THEME)
    assert {p.block_id for p in solve(fitted)} == {"ghost", "body"}


def test_cards_borrow_width_when_only_slack_blocks_the_rebalance() -> None:
    """需求本身排得下、加上吸附余量却超了：不能因此放弃补宽，把卡片压成竖排。

    回归用例：卡片列在 38% 时每张卡只剩几十 pt，中文一行一个字。
    """
    bullets = BulletsBlock(
        id="body",
        slot_id="body",
        items=[
            "声明变量先定类型：基本类型保存值，引用类型保存地址；比较内容用 equals，避免误用 ==",
            "if/switch 处理分支，for/while 处理重复；循环前明确终止条件，重点检查边界",
            "方法把长逻辑拆成可复用单元；基本类型参数是值拷贝，对象参数拷贝的是引用地址",
            "数组长度创建后固定，下标从 0 到 length-1；越界会抛 ArrayIndexOutOfBoundsException",
        ],
    )
    cards = _cards(3)
    tree = FlexContainer(
        type="row",
        id="root",
        gap_pt=16.0,
        ratios=[62.0, 38.0],
        children=[
            FlexLeaf(id="leaf-left", block_id="body", grow=1.0, text_style="bullet"),
            FlexLeaf(id="leaf-cards", block_id="cards", grow=1.0),
        ],
    )

    widths = _widths_pt(fit_row_widths(tree, [bullets, cards], theme=THEME))

    # 卡片应该拿到更宽的一侧
    assert widths["cards"] > widths["body"]
    # 每张卡的内容区至少排得下 MIN_CHARS_PER_LINE 个字
    per_card = (widths["cards"] - 2 * 16.0) / 3 - 2 * 12.0
    assert per_card >= MIN_CHARS_PER_LINE * BODY_SIZE_PT
