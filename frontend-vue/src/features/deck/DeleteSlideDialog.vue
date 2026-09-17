<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import { slideDisplayTitle, type DeckSlide } from '@/features/deck/types'

const props = defineProps<{
  slide: DeckSlide
  slideCount: number
  pending: boolean
}>()

const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <Dialog
    title="删除这一页？"
    :description="`「${slideDisplayTitle(props.slide)}」及其内容会一并删除，且无法撤销。`"
    panel-class="max-w-sm"
    @close="emit('close')"
  >
    <p class="text-[13px] text-ink-soft">
      当前共 {{ props.slideCount }} 页，删除后剩 {{ props.slideCount - 1 }} 页。
    </p>

    <template #footer>
      <Button variant="ghost" size="sm" @click="emit('close')">取消</Button>
      <Button
        size="sm"
        class="bg-negative hover:bg-negative/90 disabled:hover:bg-negative"
        :disabled="props.pending"
        @click="emit('confirm')"
      >
        {{ props.pending ? '删除中…' : '删除' }}
      </Button>
    </template>
  </Dialog>
</template>
