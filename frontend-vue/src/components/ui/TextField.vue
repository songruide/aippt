<script setup lang="ts">
import { useId } from 'vue'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  label: string
  hint?: string
}>()

// placeholder / type / disabled 等原生属性由调用方透传
const model = defineModel<string | number | null>()

const inputId = useId()
const hintId = props.hint ? `${inputId}-hint` : undefined
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="inputId" class="text-[13px] font-medium text-ink-soft">{{ label }}</label>
    <input
      v-model="model"
      v-bind="$attrs"
      :id="inputId"
      :aria-describedby="hintId"
      :class="
        cn(
          'h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink',
          'placeholder:text-ink-muted/70 focus:border-accent focus:outline-none',
          'transition-colors duration-150 disabled:bg-surface-soft disabled:text-ink-muted',
        )
      "
    />
    <span v-if="hint" :id="hintId" class="text-xs text-ink-muted">{{ hint }}</span>
  </div>
</template>
