<script setup lang="ts">
import { computed } from 'vue'
import { asStringList, asText } from '@/features/deck/aiEditShared'

const props = defineProps<{
  patch: Record<string, unknown> | null
  type: string
  emptyHint: string
}>()

const kind = computed(() => asText(props.patch?.type) || props.type)
const textValue = computed(() => asText(props.patch?.text))
const bulletItems = computed(() => asStringList(props.patch?.items))
const kpiValue = computed(() => asText(props.patch?.value))
const kpiLabel = computed(() => asText(props.patch?.label))
const kpiNote = computed(() => asText(props.patch?.note))
const tableHeader = computed(() => asStringList(props.patch?.header))
const tableRows = computed<string[][]>(() => {
  const raw = props.patch?.rows
  if (!Array.isArray(raw)) return []
  return raw.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
})
const cardItems = computed(() => {
  const raw = props.patch?.items
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    return {
      icon: asText(record.icon),
      title: asText(record.title),
      desc: asText(record.desc),
    }
  })
})
const calloutIcon = computed(() => asText(props.patch?.icon))
const calloutText = computed(() => asText(props.patch?.text))
const calloutVariant = computed(() => asText(props.patch?.variant))
const imageAlt = computed(() => asText(props.patch?.alt))
</script>

<template>
  <p v-if="props.patch == null">{{ props.emptyHint }}</p>

  <p v-else-if="kind === 'text'" class="whitespace-pre-wrap">{{ textValue || '（空）' }}</p>

  <template v-else-if="kind === 'bullets'">
    <p v-if="bulletItems.length === 0">（空列表）</p>
    <ul v-else class="flex flex-col gap-1">
      <li
        v-for="(item, index) in bulletItems"
        :key="`${index}-${item.slice(0, 12)}`"
        class="flex gap-2"
      >
        <span class="text-ink-soft tabular-nums">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="min-w-0 flex-1 whitespace-pre-wrap">{{ item }}</span>
      </li>
    </ul>
  </template>

  <dl v-else-if="kind === 'kpi'" class="flex flex-col gap-1.5">
    <div>
      <dt class="text-[10px] text-ink-soft">数值</dt>
      <dd>{{ kpiValue || '—' }}</dd>
    </div>
    <div>
      <dt class="text-[10px] text-ink-soft">标签</dt>
      <dd>{{ kpiLabel || '—' }}</dd>
    </div>
    <div>
      <dt class="text-[10px] text-ink-soft">备注</dt>
      <dd>{{ kpiNote.trim() ? kpiNote : '—' }}</dd>
    </div>
  </dl>

  <div v-else-if="kind === 'table'" class="overflow-x-auto">
    <table class="w-full border-collapse text-left">
      <thead>
        <tr>
          <th
            v-for="(cell, index) in tableHeader"
            :key="`h-${index}`"
            class="border-b border-line px-1.5 py-1 font-medium"
          >
            {{ cell || '—' }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in tableRows" :key="`r-${rowIndex}`">
          <td
            v-for="(cell, cellIndex) in row"
            :key="`c-${rowIndex}-${cellIndex}`"
            class="border-b border-line/60 px-1.5 py-1"
          >
            {{ cell || '—' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <template v-else-if="kind === 'cards'">
    <p v-if="cardItems.length === 0">（空卡片）</p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="(item, index) in cardItems"
        :key="`${index}-${item.title.slice(0, 12)}`"
        class="flex flex-col gap-0.5"
      >
        <span class="font-medium">{{ item.icon ? `${item.icon} ` : '' }}{{ item.title || '—' }}</span>
        <span class="whitespace-pre-wrap text-ink-soft">{{ item.desc || '—' }}</span>
      </li>
    </ul>
  </template>

  <p v-else-if="kind === 'callout'" class="whitespace-pre-wrap">
    {{ calloutIcon ? `${calloutIcon} ` : '' }}{{ calloutText || '（空）' }}
    <span class="ml-2 text-[10px] text-ink-soft">[{{ calloutVariant || 'note' }}]</span>
  </p>

  <p v-else-if="kind === 'image'">{{ imageAlt || '图片占位' }}</p>

  <p v-else-if="kind === 'chart'">图表</p>

  <p v-else>（无法展示）</p>
</template>
