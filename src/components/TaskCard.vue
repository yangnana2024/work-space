<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Task, TaskPriority, TaskStatus } from '../types/task'
import TaskPriorityPicker from './TaskPriorityPicker.vue'
import TaskStatusPicker from './TaskStatusPicker.vue'
import Avatar from './Avatar.vue'
const props = withDefaults(defineProps<{
  task: Task
  layout?: 'list' | 'kanban'
}>(), {
  layout: 'list',
})
const emit = defineEmits<{
  toggle: [task: Task]
  delete: [task: Task]
  leaveShare: [task: Task]
  move: [payload: { taskId: number; status: TaskStatus }]
  priority: [payload: { taskId: number; priority: TaskPriority }]
  dueDate: [payload: { taskId: number; dueDate: string }]
  edit: [task: Task]
  manageShare: [task: Task]
}>()
const priorityLabels = {
  low: '低优先级',
  medium: '中优先级',
  high: '高优先级',
}
const isDeleteConfirmOpen = ref(false)
const canEdit = computed(() => props.task.currentRole === 'owner' || props.task.currentRole === 'editor')
const canDelete = computed(() => props.task.currentRole === 'owner')
const canLeaveShare = computed(() => Boolean(props.task.currentRole && props.task.currentRole !== 'owner'))
const dueDateInput = ref<HTMLInputElement | null>(null)
const taskActionTrigger = ref<HTMLButtonElement | null>(null)
const cancelDeleteButton = ref<HTMLButtonElement | null>(null)
function openDueDatePicker() {
  const input = dueDateInput.value
  if (!input) return
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    // Fall back for browsers that do not allow showPicker in this context.
  }
  input.click()
}
function updateDueDate(event: Event) {
  const dueDate = (event.currentTarget as HTMLInputElement).value
  if (dueDate) emit('dueDate', { taskId: props.task.id, dueDate })
}
function openTaskActionConfirm(event: MouseEvent) {
  taskActionTrigger.value = event.currentTarget as HTMLButtonElement
  isDeleteConfirmOpen.value = true
  nextTick(() => cancelDeleteButton.value?.focus())
}
function closeDeleteConfirm() {
  isDeleteConfirmOpen.value = false
  nextTick(() => taskActionTrigger.value?.focus())
}
function confirmTaskAction(task: Task) {
  isDeleteConfirmOpen.value = false
  if (canDelete.value) emit('delete', task)
  else if (canLeaveShare.value) emit('leaveShare', task)
}
</script>

<template>
  <article
    class="grid gap-3 rounded-md border border-slate-200 border-l-4 bg-white px-3 py-3 shadow-sm transition-transform duration-200 hover:scale-[1.02] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20 sm:px-4 sm:py-4 sm:gap-4"
    :class="[
      layout === 'kanban' ? 'grid-cols-1' : 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
      {
        'border-l-rose-500 dark:border-l-rose-400': task.priority === 'high',
        'border-l-amber-400 dark:border-l-amber-300': task.priority === 'medium',
        'border-l-emerald-500 dark:border-l-emerald-400': task.priority === 'low',
      },
    ]"
  >
    <div class="flex min-w-0 gap-3">
      <label class="grid size-11 shrink-0 cursor-pointer place-items-center" :aria-label="task.status === 'done' ? '标记为待办' : '标记为完成'">
        <input
          type="checkbox"
          :checked="task.status === 'done'"
          :aria-label="task.status === 'done' ? '标记为待办' : '标记为完成'"
          class="size-5 cursor-pointer accent-emerald-600"
          @change="emit('toggle', task)"
        />
      </label>
      <div class="min-w-0 flex-1">
        <!-- 标题：单行截断，超出省略 -->
        <h3
          class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap overflow-hidden text-ellipsis"
          :class="task.status === 'done' ? 'text-slate-400 line-through dark:text-slate-500' : ''"
        >
          {{ task.title }}
        </h3>
        <!-- 描述：最多2行，超出省略 -->
        <p class="mb-0 mt-1.5 text-sm leading-5 text-slate-500 dark:text-slate-400 line-clamp-2">
          {{ task.description }}
        </p>
        <div class="mt-3 space-y-2">
          <div
            v-if="(task.currentRole === 'owner' && (task.shareCount ?? 0) > 0) || (task.currentRole && task.currentRole !== 'owner')"
            class="flex flex-wrap items-center gap-2"
          >
            <button
              v-if="task.currentRole === 'owner' && (task.shareCount ?? 0) > 0"
              type="button"
              class="flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-blue-950 dark:text-blue-300 whitespace-nowrap"
              :aria-label="`已共享给 ${task.shareCount} 位成员，管理共享`"
              @click.stop="emit('manageShare', task)"
            >
              <span class="flex -space-x-2" aria-hidden="true">
                <span
                  v-for="member in task.shareMembers ?? []"
                  :key="member.username"
                  class="relative z-0 inline-flex shrink-0"
                >
                  <Avatar
                    :username="member.username"
                    :size="24"
                    :title="`${member.username} · ${member.permission === 'editor' ? '可编辑' : '仅查看'}`"
                  />
                  <span
                    aria-hidden="true"
                    class="absolute -bottom-0.5 -right-0.5 size-2 rounded-full"
                    :class="member.permission === 'editor' ? 'bg-emerald-500' : 'bg-sky-500'"
                  />
                </span>
              </span>
              已共享 · {{ task.shareCount }}
            </button>
            <span
              v-if="task.currentRole && task.currentRole !== 'owner'"
              class="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300 whitespace-nowrap"
            >
              {{ task.currentRole === 'editor' ? '共享任务 · 可编辑' : '共享任务 · 仅查看' }}<template v-if="task.ownerUsername"> · {{ task.ownerUsername }}</template>
            </span>
          </div>
          <div class="flex flex-nowrap items-center gap-2">
            <div class="shrink-0">
              <TaskStatusPicker
                v-if="canEdit"
                :model-value="task.status"
                :task-title="task.title"
                @update:model-value="emit('move', { taskId: task.id, status: $event })"
              />
              <span v-else class="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap">
                {{ task.status === 'done' ? '已完成' : task.status === 'in-progress' ? '进行中' : '待办' }}
              </span>
            </div>
            <div class="shrink-0">
              <TaskPriorityPicker
                v-if="canEdit"
                :model-value="task.priority"
                :task-title="task.title"
                variant="badge"
                @update:model-value="emit('priority', { taskId: task.id, priority: $event })"
              />
              <span v-else class="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap">
                {{ priorityLabels[task.priority] }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="flex items-center justify-between gap-4 pl-7 sm:justify-end sm:pl-0">
      <div class="relative min-w-0">
        <input
          ref="dueDateInput"
          type="date"
          :value="task.dueDate"
          :disabled="!canEdit"
          :aria-label="`修改“${task.title}”的截止日期`"
          tabindex="-1"
          class="absolute inset-0 -z-10 h-full w-full opacity-0"
          @change="updateDueDate"
        />
        <button
          type="button"
          :aria-label="`修改“${task.title}”的截止日期`"
          :disabled="!canEdit"
          class="rounded-md px-2 py-1.5 text-left text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-default disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:text-right"
          @click="openDueDatePicker"
        >
          <div class="flex items-center gap-1 whitespace-nowrap">
            <span class="text-xs text-slate-400 dark:text-slate-500">截止日期</span>
            <time class="font-medium text-slate-600 dark:text-slate-300">{{ task.dueDate }}</time>
          </div>
        </button>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="编辑任务"
          title="编辑任务"
          class="grid size-11 place-items-center rounded-md text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          @click="emit('edit', task)"
        >
          编辑
        </button>
        <button
          v-if="canDelete || canLeaveShare"
          ref="taskActionTrigger"
          type="button"
          :aria-label="canDelete ? '删除任务' : '从我的任务中移除共享任务'"
          :title="canDelete ? '删除任务' : '从我的任务中移除'"
          class="grid size-11 place-items-center rounded-md text-xl leading-none text-slate-400 transition-colors focus-visible:outline-2 dark:text-slate-500"
          :class="canDelete ? 'hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-rose-500 dark:hover:bg-rose-950 dark:hover:text-rose-300' : 'hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200'"
          @click="openTaskActionConfirm"
        >
          ×
        </button>
      </div>
    </div>
  </article>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isDeleteConfirmOpen"
        class="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"
        @click.self="closeDeleteConfirm"
        @keydown.esc.stop.prevent="closeDeleteConfirm"
      >
        <section
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="`task-action-title-${task.id}`"
          :aria-describedby="`task-action-description-${task.id}`"
          class="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <h2 :id="`task-action-title-${task.id}`" class="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">
            {{ canDelete ? '确定删除任务？' : '从我的任务中移除？' }}
          </h2>
          <p :id="`task-action-description-${task.id}`" class="mb-0 mt-2 break-words text-sm leading-6 text-slate-600 dark:text-slate-300">
            <template v-if="canDelete">“{{ task.title }}”删除后无法恢复。</template>
            <template v-else>“{{ task.title }}”将从你的列表中移除，不会删除创建者的任务。</template>
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <button
              ref="cancelDeleteButton"
              type="button"
              class="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              @click="closeDeleteConfirm"
            >
              取消
            </button>
            <button
              type="button"
              class="min-h-11 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
              @click="confirmTaskAction(task)"
            >
              {{ canDelete ? '确认删除' : '确认移除' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
