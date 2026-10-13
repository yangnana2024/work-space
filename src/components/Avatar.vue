<template>
  <div
    class="flex items-center justify-center rounded-full text-white font-medium shrink-0"
    :style="{ backgroundColor: bgColor, width: size + 'px', height: size + 'px', fontSize: Math.floor(size * 0.45) + 'px' }"
    :title="username"
  >
    {{ firstChar }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  username: string
  size?: number
}>(), {
  size: 32
})

// 根据用户名哈希生成固定背景色，同一个用户颜色永远一致
const bgColor = computed(() => {
  const colors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6'
  ]
  let hash = 0
  for (let i = 0; i < props.username.length; i++) {
    hash = props.username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
})

// 取首字符：中文取第一个字，英文取第一个字母大写
const firstChar = computed(() => {
  if (!props.username) return '?'
  return props.username.charAt(0).toUpperCase()
})
</script>
