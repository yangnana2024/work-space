<script setup lang="ts">
import { computed } from 'vue'
import type { Task, TaskStatus } from '../types/task'
import TaskCard from './TaskCard.vue'
const props = defineProps<{
  tasks: Task[]
}>()
const emit = defineEmits<{
  move: [payload: { taskId: number; status: TaskStatus }]
  toggle: [task: Task]
  delete: [task: Task]
  leaveShare: [task: Task]
  priority: [payload: { taskId: number; priority: Task['priority'] }]
  dueDate: [payload: { taskId: number; dueDate: string }]
  edit: [task: Task]
  manageShare: [task: Task]
}>()
const columns: { title: string; status: TaskStatus }[] = [
  { title: '待办', status: 'todo' },
  { title: '进行中', status: 'in-progress' },
  { title: '已完成', status: 'done' },
]
const tasksByStatus = computed(() =>
  Object.fromEntries(
    columns.map((column) => [
      column.status,
      props.tasks.filter((task) => task.status === column.status),
    ]),
  ) as Record<TaskStatus, Task[]>,
)
function startDrag(event: DragEvent, task: Task) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(task.id))
}
function allowDrop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}
function dropTask(event: DragEvent, status: TaskStatus) {
  event.preventDefault()
  const rawId = event.dataTransfer?.getData('text/plain')
  if (!rawId) return
  const taskId = Number(rawId)
  if (!Number.isInteger(taskId)) return
  emit('move', { taskId, status })
}
</script>

<template>
  <div class="grid grid-cols-1 gap-3 pb-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 md:h-full">
    <section
      v-for="column in columns"
      :key="column.status"
      class="min-w-0 flex flex-col rounded-lg border border-slate-200 bg-slate-50/70 p-2 md:p-3 dark:border-slate-700 dark:bg-slate-900/80 md:max-h-[60vh]"
      :class="{
        'border-t-4 border-t-slate-400': column.status === 'todo',
        'border-t-4 border-t-sky-500': column.status === 'in-progress',
        'border-t-4 border-t-emerald-500': column.status === 'done',
      }"
      @dragover="allowDrop"
      @drop="dropTask($event, column.status)"
    >
      <header class="mb-2 flex items-center justify-between px-1 py-1 shrink-0">
        <h2 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100">{{ column.title }}</h2>
        <span class="grid min-w-6 place-items-center rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {{ tasksByStatus[column.status].length }}
        </span>
      </header>

      <ul class="m-0 min-h-24 list-none space-y-2 md:space-y-3 p-0 md:flex-1 md:overflow-y-auto pr-0.5">
        <li v-for="task in tasksByStatus[column.status]" :key="task.id">
          <div
            draggable="true"
            class="cursor-grab active:cursor-grabbing"
            @dragstart="startDrag($event, task)"
          >
            <TaskCard
              :task="task"
              layout="kanban"
              @toggle="emit('toggle', $event)"
              @delete="emit('delete', $event)"
              @leave-share="emit('leaveShare', $event)"
              @due-date="emit('dueDate', $event)"
              @edit="emit('edit', $event)"
              @manage-share="emit('manageShare', $event)"
              @move="emit('move', $event)"
            />
          </div>
        </li>
        <li v-if="tasksByStatus[column.status].length === 0" class="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
          将任务拖到此列
        </li>
      </ul>
    </section>
  </div>
</template>
