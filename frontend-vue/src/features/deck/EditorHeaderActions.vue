<script setup lang="ts">
import { Download, MoreHorizontal, Play, RefreshCw } from 'lucide-vue-next'
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import MenuItem from '@/components/ui/MenuItem.vue'
import MenuPopover from '@/components/ui/MenuPopover.vue'
import type { DeckSlide } from '@/features/deck/types'
import { cn } from '@/lib/utils'

const props = defineProps<{
  slides: DeckSlide[]
  failed: number
  deckStatus: string | undefined
  generatePending: boolean
}>()

const emit = defineEmits<{
  continueGenerate: []
  present: []
  export: []
  regenerateAll: []
}>()

const canPresent = computed(() => props.slides.some((slide) => slide.status === 'ready'))
</script>

<template>
  <Button
    v-if="props.deckStatus === 'partial' || props.failed > 0"
    variant="ghost"
    size="sm"
    :disabled="props.generatePending"
    @click="emit('continueGenerate')"
  >
    <RefreshCw :class="cn('size-3.5', props.generatePending && 'animate-spin')" />
    继续生成
  </Button>
  <Button variant="ghost" size="sm" :disabled="!canPresent" @click="emit('present')">
    <Play class="size-3.5" />
    演示
  </Button>
  <Button size="sm" :disabled="props.slides.length === 0" @click="emit('export')">
    <Download class="size-4" />
    导出
  </Button>
  <MenuPopover v-if="props.slides.length > 0" label="更多操作" panel-class="w-52">
    <template #trigger="{ open, toggle }">
      <button
        type="button"
        aria-label="更多操作"
        :aria-expanded="open"
        class="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
        @click="toggle"
      >
        <MoreHorizontal class="size-4" />
      </button>
    </template>
    <template #default="{ close }">
      <MenuItem
        :disabled="props.generatePending"
        hint="会覆盖所有页面的现有内容"
        @select="
          () => {
            close()
            emit('regenerateAll')
          }
        "
      >
        全部重新生成
      </MenuItem>
    </template>
  </MenuPopover>
</template>
