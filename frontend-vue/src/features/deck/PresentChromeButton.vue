<script setup lang="ts">
withDefaults(defineProps<{ label: string; disabled?: boolean }>(), { disabled: false })

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :disabled="disabled"
    class="grid size-9 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/12 hover:text-white disabled:pointer-events-none disabled:opacity-30"
    @click.stop="emit('click')"
  >
    <slot />
  </button>
</template>
