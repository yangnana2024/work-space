<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 shadow-xl">
      <h2 class="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">
        共享任务
      </h2>
      <div class="space-y-4">
        <div>
          <label for="share-username" class="mb-1 block text-sm text-slate-700 dark:text-slate-300">按用户名共享</label>
          <input
            id="share-username"
            v-model="username"
            type="text"
            autocomplete="off"
            class="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="输入对方完整用户名"
          />
          <p class="mb-0 mt-1 text-xs text-slate-500 dark:text-slate-400">信任对象会直接获得权限，其他用户需要接受邀请。</p>
        </div>
        <div>
          <label class="block text-sm mb-1 text-slate-700 dark:text-slate-300">权限设置</label>
          <div class="flex gap-4 text-slate-700 dark:text-slate-300">
            <label class="flex items-center gap-2 text-sm">
              <input type="radio" v-model="permission" value="viewer" />
              <span>仅查看</span>
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input type="radio" v-model="permission" value="editor" />
              <span>可编辑</span>
            </label>
          </div>
        </div>
        <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
        <button
          type="button"
          @click="handleInvite"
          :disabled="!username.trim() || loading"
          class="min-h-11 w-full rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {{ loading ? '处理中...' : '共享或发送邀请' }}
        </button>
        <p v-if="notice" role="status" class="mb-0 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{{ notice }}</p>
        <div class="border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            :disabled="loading"
            class="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="handleCreateCode"
          >
            生成一次性共享码
          </button>
          <div v-if="shareCode" class="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-800">
            <p class="m-0 text-xs text-slate-500 dark:text-slate-400">24 小时内有效，兑换一次后失效</p>
            <code class="mt-2 block break-all text-base font-semibold text-slate-900 dark:text-slate-100">{{ shareCode }}</code>
            <time class="mt-1 block text-xs text-slate-500 dark:text-slate-400" :datetime="shareCodeExpiresAt">有效期至 {{ new Date(shareCodeExpiresAt).toLocaleString() }}</time>
          </div>
        </div>
        <div v-if="pendingInvites.length" class="border-t border-slate-200 pt-4 dark:border-slate-700">
          <p class="m-0 mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">待处理邀请</p>
          <div v-for="invite in pendingInvites" :key="invite.id" class="flex items-center justify-between gap-3 py-2 text-sm">
            <span class="min-w-0 truncate text-slate-600 dark:text-slate-300">
              {{ invite.recipientUsername || '共享码' }} · {{ invite.permission === 'editor' ? '可编辑' : '仅查看' }}
            </span>
            <button type="button" class="min-h-10 shrink-0 rounded-md px-3 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" @click="handleRevokeInvite(invite.id)">撤回</button>
          </div>
        </div>
        <div v-if="shares.length" class="pt-4 border-t border-slate-200 dark:border-gray-700">
          <p class="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">已共享</p>
          <div class="space-y-2">
            <div
              v-for="share in shares"
              :key="share.id"
              class="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300"
            >
              <div class="flex items-center gap-2">
                <Avatar :username="share.sharedWithUsername" :size="24" />
                <span>{{ share.sharedWithUsername }}</span>
                <span class="text-xs text-slate-500">
                  {{ share.permission === 'editor' ? '可编辑' : '仅查看' }}
                </span>
              </div>
              <button
                type="button"
                @click="openRemoveShareConfirm(share, $event)"
                class="text-red-500 hover:text-red-600 text-xs"
              >
                移除
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <button
          @click="emit('close')"
          class="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
  <div
    v-if="shareToRemove"
    class="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"
    @click.self="closeRemoveShareConfirm"
    @keydown.esc.stop.prevent="closeRemoveShareConfirm"
  >
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="remove-share-title"
      aria-describedby="remove-share-description"
      class="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <h2 id="remove-share-title" class="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">确定移除共享？</h2>
      <p id="remove-share-description" class="mb-0 mt-2 break-words text-sm leading-6 text-slate-600 dark:text-slate-300">
        移除后，{{ shareToRemove.sharedWithUsername }} 将无法访问此任务。
      </p>
      <p v-if="removeShareError" class="mb-0 mt-2 text-sm text-rose-600 dark:text-rose-400">
        {{ removeShareError }}
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          ref="cancelRemoveShareButton"
          type="button"
          :disabled="isRemovingShare"
          class="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="closeRemoveShareConfirm"
        >
          取消
        </button>
        <button
          type="button"
          :disabled="isRemovingShare"
          class="min-h-11 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
          @click="confirmRemoveShare"
        >
          {{ isRemovingShare ? '移除中...' : '确认移除' }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import Avatar from './Avatar.vue'
import {
  createTaskShareCode,
  getTaskInvites,
  getTaskShares,
  inviteTaskShare,
  removeTaskShare,
  revokeTaskInvite,
} from '../utils/storage'
const props = defineProps<{
  taskId: number
}>()
const emit = defineEmits<{
  close: []
  success: []
}>()
interface TaskShare {
  id: number
  sharedWithUserId: number
  sharedWithUsername: string
  permission: 'viewer' | 'editor'
}
interface PendingInvite {
  id: number
  recipientUsername: string | null
  permission: 'viewer' | 'editor'
}
const shares = ref<TaskShare[]>([])
const pendingInvites = ref<PendingInvite[]>([])
const username = ref('')
const permission = ref<'viewer' | 'editor'>('viewer')
const error = ref('')
const loading = ref(false)
const notice = ref('')
const shareCode = ref('')
const shareCodeExpiresAt = ref('')
const shareToRemove = ref<{ sharedWithUserId: number; sharedWithUsername: string } | null>(null)
const removeShareTrigger = ref<HTMLButtonElement | null>(null)
const cancelRemoveShareButton = ref<HTMLButtonElement | null>(null)
const isRemovingShare = ref(false)
const removeShareError = ref('')
async function loadData() {
  error.value = ''
  try {
    const [shareData, inviteData] = await Promise.all([
      getTaskShares(props.taskId),
      getTaskInvites(props.taskId),
    ])
    shares.value = shareData
    pendingInvites.value = inviteData
  } catch (e: any) {
    error.value = e.message
  }
}
async function handleInvite() {
  error.value = ''
  notice.value = ''
  loading.value = true
  try {
    const result = await inviteTaskShare(props.taskId, username.value.trim(), permission.value)
    notice.value = result.shared ? '已向信任对象直接共享任务。' : '邀请已发送，等待对方接受。'
    await loadData()
    username.value = ''
    emit('success')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
async function handleCreateCode() {
  error.value = ''
  loading.value = true
  try {
    const result = await createTaskShareCode(props.taskId, permission.value)
    shareCode.value = result.code
    shareCodeExpiresAt.value = result.expiresAt
    await loadData()
    emit('success')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
async function handleRevokeInvite(inviteId: number) {
  error.value = ''
  try {
    await revokeTaskInvite(inviteId)
    await loadData()
    emit('success')
  } catch (e: any) {
    error.value = e.message
  }
}
function openRemoveShareConfirm(
  share: { sharedWithUserId: number; sharedWithUsername: string },
  event: MouseEvent,
) {
  shareToRemove.value = share
  removeShareTrigger.value = event.currentTarget as HTMLButtonElement
  removeShareError.value = ''
  nextTick(() => cancelRemoveShareButton.value?.focus())
}
function closeRemoveShareConfirm() {
  if (isRemovingShare.value) return
  shareToRemove.value = null
  removeShareError.value = ''
  nextTick(() => removeShareTrigger.value?.focus())
}
async function confirmRemoveShare() {
  const share = shareToRemove.value
  if (!share || isRemovingShare.value) return
  removeShareError.value = ''
  isRemovingShare.value = true
  try {
    await removeTaskShare(props.taskId, share.sharedWithUserId)
    shareToRemove.value = null
    await loadData()
    emit('success')
  } catch (e: any) {
    removeShareError.value = e.message
  } finally {
    isRemovingShare.value = false
  }
}
onMounted(() => {
  loadData()
})
</script>
