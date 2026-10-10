<script setup lang="ts">
import { onMounted, ref } from 'vue'

const STORAGE_KEY = 'work-space-theme'
const isDark = ref(false)

function applyTheme(dark: boolean) {
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
}

function toggleTheme() {
  const nextIsDark = !isDark.value
  applyTheme(nextIsDark)

  try {
    localStorage.setItem(STORAGE_KEY, nextIsDark ? 'dark' : 'light')
  } catch {
    // The current-page theme still works if storage is unavailable.
  }
}

onMounted(() => {
  let storedTheme: string | null = null
  try {
    storedTheme = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Fall back to the system preference when storage is unavailable.
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(storedTheme === 'dark' || (storedTheme !== 'light' && prefersDark))
})
</script>

<template>
  <button
    type="button"
    class="grid size-11 place-items-center rounded-md border border-slate-200 bg-white text-lg text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    :aria-label="isDark ? '切换到亮色模式' : '切换到深色模式'"
    :title="isDark ? '切换到亮色模式' : '切换到深色模式'"
    @click="toggleTheme"
  >
    <span aria-hidden="true">{{ isDark ? '☀' : '☾' }}</span>
  </button>
</template>
