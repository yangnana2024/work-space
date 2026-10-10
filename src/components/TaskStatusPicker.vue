<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { TaskStatus } from '../types/task'

const props = withDefaults(defineProps<{
  modelValue: TaskStatus
  taskTitle: string
  variant?: 'badge' | 'field'
  id?: string
}>(), {
  variant: 'badge',
})

const emit = defineEmits<{
  'update:modelValue': [status: TaskStatus]
}>()

const statusOptions: { label: string; value: TaskStatus }[] = [
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'in-progress' },
  { label: '已完成', value: 'done' },
]

const statusLabels: Record<TaskStatus, string> = {
  todo: '待办',
  'in-progress': '进行中',
  done: '完成',
}

const isOpen = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const firstOption = ref<HTMLButtonElement | null>(null)

function badgeClass(status: TaskStatus) {
  return {
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300': status === 'todo',
    'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300': status === 'in-progress',
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300': status === 'done',
  }
}

function openPicker() {
  isOpen.value = true
  nextTick(() => firstOption.value?.focus())
}

function closePicker() {
  isOpen.value = false
  nextTick(() => trigger.value?.focus())
}

function selectStatus(status: TaskStatus) {
  emit('update:modelValue', status)
  closePicker()
}
</script>

<template>
  <template v-if="variant === 'badge'">
    <button
      ref="trigger"
      type="button"
      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-0 focus-visible:outline-2 focus-visible:outline-indigo-500"
      :aria-label="`更改“${taskTitle}”的状态，当前为${statusLabels[modelValue]}`"
      aria-haspopup="dialog"
      @click="openPicker"
    >
      <span class="rounded-md px-2 py-1 text-xs font-medium" :class="badgeClass(modelValue)">
        {{ statusLabels[modelValue] }}
      </span>
    </button>
  </template>

  <button
    v-else
    :id="id"
    ref="trigger"
    type="button"
    aria-haspopup="dialog"
    :aria-label="`更改“${taskTitle}”的状态，当前为${statusLabels[modelValue]}`"
    class="flex min-h-11 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-left transition hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500"
    @click="openPicker"
  >
    <span class="rounded-md px-2 py-1 text-xs font-medium" :class="badgeClass(modelValue)">
      {{ statusLabels[modelValue] }}
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
          :aria-label="`更改“${taskTitle}”的状态`"
          class="w-full rounded-t-xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900 sm:max-w-sm sm:rounded-xl sm:pb-5"
        >
          <div class="mb-4 flex items-center justify-between">
            <h2 class="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">更改任务状态</h2>
            <button
              type="button"
              class="grid size-11 place-items-center rounded-md text-xl text-slate-400 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800"
              aria-label="关闭状态选项"
              @click="closePicker"
            >
              ×
            </button>
          </div>
          <div class="grid grid-cols-1 gap-2">
            <button
              v-for="(option, index) in statusOptions"
              :key="option.value"
              :ref="index === 0 ? (element) => { firstOption = element as HTMLButtonElement | null } : undefined"
              type="button"
              class="flex min-h-11 items-center justify-between rounded-md border px-4 text-left text-sm font-medium transition-colors"
              :class="modelValue === option.value
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'"
              :aria-pressed="modelValue === option.value"
              @click="selectStatus(option.value)"
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
