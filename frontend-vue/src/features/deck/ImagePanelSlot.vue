<script setup lang="ts">
import { ImageIcon, Upload } from 'lucide-vue-next'
import { ref } from 'vue'
import { useReplaceSlideImage } from '@/features/deck/api'
import { ACCEPTED_IMAGE, type DeckSlide } from '@/features/deck/types'
import { errorMessage } from '@/lib/errors'
import type { ImageBlock } from '@/render/types'

const SOURCE_LABEL: Record<ImageBlock['source'], string> = {
  generated: 'AI 生成',
  stock: '图库',
  upload: '手动上传',
  placeholder: '占位图',
}

const props = withDefaults(
  defineProps<{
    projectId: string
    slide: DeckSlide
    block: ImageBlock
    label: string
    disabled?: boolean
  }>(),
  { disabled: false },
)

const inputRef = ref<HTMLInputElement | null>(null)
const replace = useReplaceSlideImage(props.projectId)

const pick = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空，否则连续选择同一个文件不会再触发 change
  input.value = ''
  if (file) {
    replace.mutate({
      slideId: props.slide.id,
      blockId: props.block.id,
      revision: props.slide.revision,
      file,
    })
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between gap-2">
      <span class="text-[13px] font-medium">{{ props.label }}</span>
      <span class="text-xs text-ink-muted">{{ SOURCE_LABEL[props.block.source] }}</span>
    </div>

    <div class="overflow-hidden rounded-xl border border-line bg-surface-soft">
      <img
        v-if="props.block.url"
        :src="props.block.url"
        :alt="props.block.alt"
        class="aspect-video w-full object-cover"
      />
      <div v-else class="grid aspect-video place-items-center text-ink-muted">
        <ImageIcon class="size-5" />
      </div>
    </div>

    <button
      type="button"
      :disabled="props.disabled || replace.isPending.value"
      class="flex items-center justify-center gap-1.5 rounded-full border border-line py-2 text-[13px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
      @click="inputRef?.click()"
    >
      <Upload class="size-3.5" />
      {{ replace.isPending.value ? '上传中…' : '替换图片' }}
    </button>
    <input
      ref="inputRef"
      type="file"
      :accept="ACCEPTED_IMAGE"
      :aria-label="`${props.label}：上传 PNG、JPEG 或 WebP`"
      class="sr-only"
      @change="pick"
    />

    <!-- 图库授权要求标注作者：放在编辑侧栏而不是页面里，既满足要求也不占版面 -->
    <p v-if="props.block.credit" class="text-xs leading-relaxed text-ink-muted">
      {{ props.block.credit }}
    </p>
    <p v-if="replace.isError.value" role="alert" class="text-xs text-negative">
      {{ errorMessage(replace.error.value, '换图失败') }}
    </p>
  </div>
</template>
