<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { TaskPriority } from '../types/task'

const props = withDefaults(defineProps<{
  modelValue: TaskPriority
  taskTitle: string
  variant?: 'badge' | 'field'
  id?: string
}>(), {
  variant: 'badge',
})

const emit = defineEmits<{
  'update:modelValue': [priority: TaskPriority]
}>()

const priorityOptions: { label: string; value: TaskPriority }[] = [
  { label: '低优先级', value: 'low' },
  { label: '中优先级', value: 'medium' },
  { label: '高优先级', value: 'high' },
]

const priorityLabels: Record<TaskPriority, string> = {
  low: '低优先级',
  medium: '中优先级',
  high: '高优先级',
}

const badgeClass: Record<TaskPriority, string> = {
  low: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  high: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

const isOpen = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const firstOption = ref<HTMLButtonElement | null>(null)

function openPicker() {
  isOpen.value = true
  nextTick(() => firstOption.value?.focus())
}

function closePicker() {
  isOpen.value = false
  nextTick(() => trigger.value?.focus())
}

function selectPriority(priority: TaskPriority) {
  emit('update:modelValue', priority)
  closePicker()
}
</script>

<template>
  <button
    v-if="variant === 'badge'"
    ref="trigger"
    type="button"
    class="rounded-md px-2 py-1 text-xs font-medium transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-indigo-500"
    :class="badgeClass[modelValue]"
    :aria-label="`更改“${taskTitle}”的优先级，当前为${priorityLabels[modelValue]}`"
    aria-haspopup="dialog"
    @click="openPicker"
  >
    {{ priorityLabels[modelValue] }}
  </button>

  <button
    v-else
    :id="id"
    ref="trigger"
    type="button"
    aria-haspopup="dialog"
    :aria-label="`更改“${taskTitle}”的优先级，当前为${priorityLabels[modelValue]}`"
    class="flex min-h-11 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-left transition hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500"
    @click="openPicker"
  >
    <span class="rounded-md px-2 py-1 text-xs font-medium" :class="badgeClass[modelValue]">
      {{ priorityLabels[modelValue] }}
    </span>
    <span class="text-xs text-slate-400">更改</span>
  </button>

  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[60] grid items-end bg-slate-950/45 sm:place-items-center sm:p-4"
        @click.self="closePicker"
        @keydown.esc.stop.prevent="closePicker"
      >
        <section
          role="dialog"
          aria-modal="true"
          :aria-label="`更改“${taskTitle}”的优先级`"
          class="w-full rounded-t-xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900 sm:max-w-sm sm:rounded-xl sm:pb-5"
        >
          <div class="mb-4 flex items-center justify-between">
            <h2 class="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">更改优先级</h2>
            <button
              type="button"
              class="grid size-11 place-items-center rounded-md text-xl text-slate-400 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800"
              aria-label="关闭优先级选项"
              @click="closePicker"
            >
              ×
            </button>
          </div>
          <div class="grid grid-cols-1 gap-2">
            <button
              v-for="(option, index) in priorityOptions"
              :key="option.value"
              :ref="index === 0 ? (element) => { firstOption = element as HTMLButtonElement | null } : undefined"
              type="button"
              class="flex min-h-11 items-center justify-between rounded-md border px-4 text-left text-sm font-medium transition-colors"
              :class="modelValue === option.value
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'"
              :aria-pressed="modelValue === option.value"
              @click="selectPriority(option.value)"
            >
              {{ option.label }}
              <span v-if="modelValue === option.value" aria-hidden="true">当前</span>
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
