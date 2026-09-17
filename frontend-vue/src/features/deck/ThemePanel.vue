<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { Check, RotateCcw } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useUpdateProjectTheme } from '@/features/projects/api'
import type { ProjectDetail } from '@/features/projects/types'
import { cloneData } from '@/lib/clone'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { themeList } from '@/render/design'
import ThemeCover from '@/render/ThemeCover.vue'
import {
  BULLET_MARKERS,
  FONT_PRESETS,
  matchFontPresetId,
  PALETTE_KEYS,
  type PaletteKey,
  resolveTheme,
  SIZE_KEYS,
  type SizeKey,
  type ThemeOverrides,
} from '@/render/themeOverrides'

const DEBOUNCE_MS = 320

function asOverrides(raw: ProjectDetail['theme_overrides']): ThemeOverrides {
  if (!raw || typeof raw !== 'object') return {}
  return raw as ThemeOverrides
}

/**
 * 主题微调：换预设 + 颜色/字体/字号/圆角。
 * 本地先合并出预览，防抖后写入 theme_overrides。
 */
const props = withDefaults(
  defineProps<{
    project: ProjectDetail
    disabled?: boolean
  }>(),
  { disabled: false },
)

const titleId = useId()
const queryClient = useQueryClient()
const update = useUpdateProjectTheme(props.project.id)
const draft = ref<ThemeOverrides>(asOverrides(props.project.theme_overrides))
const themeId = ref(props.project.theme_id)
let timerRef: number | null = null
let skipNextSync = false
const detailKey = ['projects', props.project.id] as const

const paintProject = (nextThemeId: string, nextOverrides: ThemeOverrides) => {
  queryClient.setQueryData<ProjectDetail>(detailKey, (current) =>
    current
      ? { ...current, theme_id: nextThemeId, theme_overrides: nextOverrides }
      : current,
  )
}

watch(
  () => [props.project.theme_id, props.project.theme_overrides] as const,
  () => {
    if (skipNextSync) {
      skipNextSync = false
      return
    }
    themeId.value = props.project.theme_id
    draft.value = asOverrides(props.project.theme_overrides)
  },
)

onBeforeUnmount(() => {
  if (timerRef != null) window.clearTimeout(timerRef)
})

const resolved = computed(() => resolveTheme(themeId.value, draft.value))
const fontPresetId = computed(
  () => matchFontPresetId(draft.value.fonts) ?? matchFontPresetId(resolved.value.fonts),
)
const busy = computed(() => props.disabled)
const hasOverrides = computed(() => Object.keys(draft.value).length > 0)

const persistOverrides = (next: ThemeOverrides) => {
  if (timerRef != null) window.clearTimeout(timerRef)
  timerRef = window.setTimeout(() => {
    skipNextSync = true
    update.mutate({ overrides: next })
  }, DEBOUNCE_MS)
}

const patchDraft = (recipe: (current: ThemeOverrides) => ThemeOverrides) => {
  const next = recipe(draft.value)
  draft.value = next
  paintProject(themeId.value, next)
  persistOverrides(next)
}

const selectPreset = (id: string) => {
  if (busy.value || id === themeId.value) return
  if (timerRef != null) window.clearTimeout(timerRef)
  themeId.value = id
  draft.value = {}
  paintProject(id, {})
  skipNextSync = true
  update.mutate({ theme_id: id, overrides: {} })
}

const resetOverrides = () => {
  if (busy.value) return
  if (timerRef != null) window.clearTimeout(timerRef)
  draft.value = {}
  paintProject(themeId.value, {})
  skipNextSync = true
  update.mutate({ overrides: {} })
}

const setPalette = (key: PaletteKey, value: string) => {
  patchDraft((current) => ({
    ...current,
    palette: { ...current.palette, [key]: value.toUpperCase() },
  }))
}

const setSize = (key: SizeKey, sizePt: number) => {
  patchDraft((current) => ({
    ...current,
    text_styles: {
      ...current.text_styles,
      [key]: { size_pt: sizePt },
    },
  }))
}

const setFontPreset = (presetId: string) => {
  const preset = FONT_PRESETS.find((item) => item.id === presetId)
  if (!preset) return
  patchDraft((current) => ({
    ...current,
    fonts: cloneData(preset.fonts),
  }))
}

const onPaletteInput = (key: PaletteKey, event: Event) => {
  setPalette(key, (event.target as HTMLInputElement).value)
}

const onFontPresetChange = (event: Event) => {
  setFontPreset((event.target as HTMLSelectElement).value)
}

const onSizeInput = (key: SizeKey, event: Event) => {
  setSize(key, Number((event.target as HTMLInputElement).value))
}

const onRadiusInput = (event: Event) => {
  const radius_pt = Number((event.target as HTMLInputElement).value)
  patchDraft((current) => ({ ...current, shape: { ...current.shape, radius_pt } }))
}

const onBulletMarkerChange = (event: Event) => {
  const bullet_marker = (event.target as HTMLSelectElement).value as 'rule' | 'dot' | 'index'
  patchDraft((current) => ({ ...current, shape: { ...current.shape, bullet_marker } }))
}
</script>

<template>
  <section :aria-labelledby="titleId" class="flex flex-col gap-5">
    <div>
      <h3 :id="titleId" class="text-sm font-semibold tracking-tight">主题与样式</h3>
      <p class="mt-1 text-xs leading-relaxed text-ink-muted">
        先选一套预设，再微调颜色、字体与字号；导出 PPTX 会使用相同样式
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <p class="text-xs font-medium text-ink-soft">预设</p>
      <div class="flex flex-col gap-2">
        <button
          v-for="theme in themeList"
          :key="theme.id"
          type="button"
          :disabled="busy"
          :aria-pressed="theme.id === themeId"
          :class="
            cn(
              'overflow-hidden rounded-xl border text-left transition-colors',
              theme.id === themeId
                ? 'border-accent ring-1 ring-accent/30'
                : 'border-line hover:border-line-strong',
              'disabled:opacity-50',
            )
          "
          @click="selectPreset(theme.id)"
        >
          <ThemeCover :theme="theme" :title="props.project.title" />
          <div class="flex items-center gap-2 px-3 py-2">
            <span class="flex-1 truncate text-[13px] font-medium">{{ theme.name }}</span>
            <Check v-if="theme.id === themeId" class="size-3.5 shrink-0 text-accent" />
          </div>
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      <p class="text-xs font-medium text-ink-soft">颜色</p>
      <ul class="flex flex-col gap-2">
        <li v-for="item in PALETTE_KEYS" :key="item.key" class="flex items-center gap-3">
          <label
            class="w-16 shrink-0 text-[12px] text-ink-muted"
            :for="`color-${item.key}`"
          >
            {{ item.label }}
          </label>
          <input
            :id="`color-${item.key}`"
            type="color"
            :disabled="busy"
            :value="resolved.palette[item.key]"
            class="h-8 w-10 cursor-pointer rounded border border-line bg-surface p-0.5 disabled:opacity-40"
            @input="onPaletteInput(item.key, $event)"
          />
          <span class="font-mono text-[11px] text-ink-muted tabular-nums">
            {{ resolved.palette[item.key] }}
          </span>
        </li>
      </ul>
    </div>

    <div class="flex flex-col gap-2">
      <label for="font-preset" class="text-xs font-medium text-ink-soft">字体</label>
      <select
        id="font-preset"
        :disabled="busy"
        :value="fontPresetId ?? FONT_PRESETS[0]?.id"
        :class="
          cn(
            'h-9 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink',
            'focus:border-accent focus:outline-none disabled:opacity-40',
          )
        "
        @change="onFontPresetChange"
      >
        <option v-for="preset in FONT_PRESETS" :key="preset.id" :value="preset.id">
          {{ preset.label }}
        </option>
      </select>
    </div>

    <div class="flex flex-col gap-3">
      <p class="text-xs font-medium text-ink-soft">字号</p>
      <label v-for="item in SIZE_KEYS" :key="item.key" class="flex flex-col gap-1.5">
        <span class="flex items-center justify-between text-[12px] text-ink-muted">
          <span>{{ item.label }}</span>
          <span class="tabular-nums">{{ Math.round(resolved.text_styles[item.key]?.size_pt ?? 14) }} pt</span>
        </span>
        <input
          type="range"
          :min="8"
          :max="72"
          :step="1"
          :disabled="busy"
          :value="Math.round(resolved.text_styles[item.key]?.size_pt ?? 14)"
          class="w-full accent-[var(--color-accent)] disabled:opacity-40"
          @input="onSizeInput(item.key, $event)"
        />
      </label>
    </div>

    <div class="flex flex-col gap-3">
      <p class="text-xs font-medium text-ink-soft">形状</p>
      <label class="flex flex-col gap-1.5">
        <span class="flex items-center justify-between text-[12px] text-ink-muted">
          <span>圆角</span>
          <span class="tabular-nums">{{ Math.round(resolved.shape.radius_pt) }} pt</span>
        </span>
        <input
          type="range"
          :min="0"
          :max="24"
          :step="1"
          :disabled="busy"
          :value="Math.round(resolved.shape.radius_pt)"
          class="w-full accent-[var(--color-accent)] disabled:opacity-40"
          @input="onRadiusInput"
        />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-[12px] text-ink-muted">项目符号</span>
        <select
          :disabled="busy"
          :value="resolved.shape.bullet_marker"
          :class="
            cn(
              'h-9 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink',
              'focus:border-accent focus:outline-none disabled:opacity-40',
            )
          "
          @change="onBulletMarkerChange"
        >
          <option v-for="item in BULLET_MARKERS" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        :disabled="busy || !hasOverrides"
        @click="resetOverrides"
      >
        <RotateCcw class="size-3.5" />
        重置微调
      </Button>
      <span v-if="update.isPending.value" class="text-xs text-ink-muted">保存中…</span>
    </div>

    <p
      v-if="update.isError.value"
      role="alert"
      class="rounded-xl bg-negative/8 px-3 py-2 text-xs text-negative"
    >
      {{ errorMessage(update.error.value) }}
    </p>
  </section>
</template>
