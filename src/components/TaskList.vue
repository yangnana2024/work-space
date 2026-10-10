<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Task, TaskStatus } from '../types/task'
import TaskCard from './TaskCard.vue'

const props = defineProps<{
  tasks: Task[]
}>()

const emit = defineEmits<{
  toggle: [task: Task]
  delete: [task: Task]
  move: [payload: { taskId: string; status: TaskStatus }]
  priority: [payload: { taskId: string; priority: Task['priority'] }]
  dueDate: [payload: { taskId: string; dueDate: string }]
  edit: [task: Task]
}>()

const filters: { label: string; value: TaskStatus | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '待办', value: 'todo' },
  { label: '进行中', value: 'in-progress' },
  { label: '完成', value: 'done' },
]

const activeFilter = ref<TaskStatus | 'all'>('all')

const visibleTasks = computed(() =>
  [...props.tasks]
    .filter((task) => activeFilter.value === 'all' || task.status === activeFilter.value)
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)),
)
</script>

<template>
  <section aria-label="任务列表" class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20">
    <div class="flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:px-6">
      <div>
        <h2 class="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">任务列表</h2>
        <p class="mb-0 mt-1 text-xs text-slate-500 dark:text-slate-400">{{ visibleTasks.length }} 个任务</p>
      </div>
      <div class="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="按状态筛选">
        <button
          v-for="filter in filters"
          :key="filter.value"
          type="button"
          class="min-h-11 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500"
          :class="activeFilter === filter.value ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'"
          :aria-pressed="activeFilter === filter.value"
          @click="activeFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <ul v-if="visibleTasks.length" class="m-0 list-none space-y-3 p-4 sm:p-5">
      <li v-for="task in visibleTasks" :key="task.id">
        <TaskCard
          :task="task"
          @toggle="emit('toggle', $event)"
          @delete="emit('delete', $event)"
          @move="emit('move', $event)"
          @priority="emit('priority', $event)"
          @due-date="emit('dueDate', $event)"
          @edit="emit('edit', $event)"
        />
      </li>
    </ul>
    <p v-else-if="tasks.length === 0" class="m-0 px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
      还没有任务，点击下方按钮创建第一个吧
    </p>
    <p v-else class="m-0 px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
      当前筛选下没有任务
    </p>
  </section>
</template>
