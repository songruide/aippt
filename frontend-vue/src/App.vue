<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/features/auth/store'
import { RouterView } from 'vue-router'

const auth = useAuthStore()

onMounted(() => {
  void auth.restore()
})
</script>

<template>
  <RouterView />
</template>
