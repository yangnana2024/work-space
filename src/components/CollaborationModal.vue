<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  getCollaborationEvents,
  getSentTaskInvites,
  getTaskInvites,
  getTrustOverview,
  markCollaborationEventRead,
  redeemTaskShareCode,
  removeTrust,
  requestTrust,
  respondTaskInvite,
  respondTrustRequest,
  revokeTaskInvite,
} from '../utils/storage'
import Avatar from './Avatar.vue'

interface TrustedUser {
  id: number
  username: string
  createdAt: string
}

interface TrustRequest {
  id: number
  username: string
  createdAt: string
}

interface TaskInvite {
  id: number
  taskId: number
  taskTitle: string
  inviterUsername: string
  permission: 'viewer' | 'editor'
  createdAt: string
  expiresAt: string
}

interface SentTaskInvite {
  id: number
  taskId: number
  taskTitle: string
  recipientUserId: number | null
  recipientUsername: string | null
  permission: 'viewer' | 'editor'
  createdAt: string
  expiresAt: string
}

interface ShareEvent {
  id: number
  taskId: number
  taskTitle: string
  actorUserId: number
  targetUserId: number
  actorUsername: string
  targetUsername: string
  permission: 'viewer' | 'editor'
  action: 'shared' | 'revoked' | 'left'
  createdAt: string
  readAt: string | null
  direction: 'sent' | 'received'
  taskExists: boolean
  taskAvailable: boolean
}

const emit = defineEmits<{
  close: []
  success: []
  pendingCount: [count: number]
  openTask: [taskId: number]
}>()

const activeTab = ref<'inbox' | 'shares' | 'trust'>('inbox')
const activeShareDirection = ref<'sent' | 'received'>('sent')
const trustedUsers = ref<TrustedUser[]>([])
const receivedTrustRequests = ref<TrustRequest[]>([])
const sentTrustRequests = ref<TrustRequest[]>([])
const taskInvites = ref<TaskInvite[]>([])
const sentTaskInvites = ref<SentTaskInvite[]>([])
const shareEvents = ref<ShareEvent[]>([])
const unreadShareCount = ref(0)
const username = ref('')
const shareCode = ref('')
const error = ref('')
const notice = ref('')
const loading = ref(false)
const pendingCount = computed(() => receivedTrustRequests.value.length + taskInvites.value.length + sentTaskInvites.value.length + unreadShareCount.value)
const incomingShareNotifications = computed(() => shareEvents.value.filter(
  (event) => event.direction === 'received' && event.action === 'shared',
))
const sentShareEvents = computed(() => shareEvents.value.filter((event) => event.direction === 'sent'))
const receivedShareEvents = computed(() => shareEvents.value.filter((event) => event.direction === 'received'))
let syncTimer: number | undefined

function shareEventDescription(event: ShareEvent) {
  if (event.action === 'revoked') {
    return event.direction === 'sent'
      ? `取消了与 ${event.targetUsername} 的共享 · 「${event.taskTitle}」`
      : `${event.actorUsername} 取消了与你的共享 · 「${event.taskTitle}」`
  }
  if (event.action === 'left') {
    return event.direction === 'sent'
      ? `退出了与 ${event.targetUsername} 的共享 · 「${event.taskTitle}」`
      : `${event.actorUsername} 退出了共享 · 「${event.taskTitle}」`
  }
  return event.direction === 'sent'
    ? `共享给 ${event.targetUsername} · 「${event.taskTitle}」`
    : `来自 ${event.actorUsername} · 「${event.taskTitle}」`
}

function shareEventCounterparty(event: ShareEvent) {
  return event.direction === 'sent' ? event.targetUsername : event.actorUsername
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [trust, invites, sentInvites, collaboration] = await Promise.all([
      getTrustOverview(),
      getTaskInvites(),
      getSentTaskInvites(),
      getCollaborationEvents(),
    ])
    trustedUsers.value = trust.trustedUsers
    receivedTrustRequests.value = trust.receivedRequests
    sentTrustRequests.value = trust.sentRequests
    taskInvites.value = invites
    sentTaskInvites.value = sentInvites
    shareEvents.value = collaboration.events
    unreadShareCount.value = collaboration.unreadCount
    emit('pendingCount', pendingCount.value)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '加载协作信息失败'
  } finally {
    loading.value = false
  }
}

async function markShareEventRead(eventId: number) {
  error.value = ''
  try {
    await markCollaborationEventRead(eventId)
    await loadData()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '标记通知失败'
  }
}

async function sendTrustRequest() {
  error.value = ''
  notice.value = ''
  try {
    await requestTrust(username.value.trim())
    notice.value = '信任申请已发送，等待对方确认。'
    username.value = ''
    await loadData()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '发送信任申请失败'
  }
}

async function handleTrustRequest(requestId: number, action: 'accept' | 'reject' | 'cancel') {
  error.value = ''
  try {
    await respondTrustRequest(requestId, action)
    await loadData()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '处理信任申请失败'
  }
}

async function handleTaskInvite(inviteId: number, action: 'accept' | 'reject') {
  error.value = ''
  try {
    await respondTaskInvite(inviteId, action)
    await loadData()
    if (action === 'accept') emit('success')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '处理任务邀请失败'
  }
}

async function redeemCode() {
  error.value = ''
  notice.value = ''
  try {
    await redeemTaskShareCode(shareCode.value.trim())
    shareCode.value = ''
    notice.value = '共享码已兑换，任务已加入列表。'
    await loadData()
    emit('success')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '兑换共享码失败'
  }
}

async function removeTrustedUser(user: TrustedUser) {
  error.value = ''
  try {
    await removeTrust(user.id)
    await loadData()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '解除信任失败'
  }
}

async function handleRevokeSentInvite(inviteId: number) {
  error.value = ''
  try {
    await revokeTaskInvite(inviteId)
    await loadData()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '撤回邀请失败'
  }
}

onMounted(() => {
  loadData()
  syncTimer = window.setInterval(() => {
    if (!document.hidden) loadData()
  }, 30_000)
})

onUnmounted(() => {
  if (syncTimer !== undefined) window.clearInterval(syncTimer)
})
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" @click.self="emit('close')">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="collaboration-title"
      class="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6"
    >
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 id="collaboration-title" class="m-0 text-lg font-semibold text-slate-900 dark:text-slate-100">协作</h2>
          <p class="mb-0 mt-1 text-sm text-slate-500 dark:text-slate-400">信任关系由双方确认；信任后可直接共享任务。</p>
        </div>
        <button
          type="button"
          aria-label="关闭协作窗口"
          class="grid size-11 shrink-0 place-items-center rounded-md text-xl text-slate-400 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <div class="mt-5 flex gap-1 border-b border-slate-200 dark:border-slate-700" role="tablist" aria-label="协作视图">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'inbox'"
          class="min-h-11 border-b-2 px-3 text-sm font-medium"
          :class="activeTab === 'inbox' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
          @click="activeTab = 'inbox'"
        >
          收件箱<span v-if="pendingCount" class="ml-1">{{ pendingCount }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'shares'"
          class="min-h-11 border-b-2 px-3 text-sm font-medium"
          :class="activeTab === 'shares' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
          @click="activeTab = 'shares'"
        >
          共享记录
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'trust'"
          class="min-h-11 border-b-2 px-3 text-sm font-medium"
          :class="activeTab === 'trust' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
          @click="activeTab = 'trust'"
        >
          信任关系
        </button>
      </div>

      <p v-if="error" role="alert" class="mb-0 mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        {{ error }}
      </p>
      <p v-if="notice" role="status" class="mb-0 mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        {{ notice }}
      </p>

      <div v-if="activeTab === 'inbox'" class="mt-5 space-y-6">
        <section>
          <h3 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100">共享通知</h3>
          <div v-if="incomingShareNotifications.length" class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="event in incomingShareNotifications" :key="event.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="flex min-w-0 items-center gap-3">
                <Avatar :username="event.actorUsername" :size="32" />
                <div class="min-w-0">
                  <p class="m-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{{ event.taskTitle }}</p>
                  <p class="m-0 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {{ event.actorUsername }} 与你共享 · {{ event.permission === 'editor' ? '可编辑' : '仅查看' }} · {{ new Date(event.createdAt).toLocaleString() }}
                  </p>
                </div>
              </div>
              <button
                v-if="!event.readAt"
                type="button"
                class="min-h-10 shrink-0 rounded-md px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                @click="markShareEventRead(event.id)"
              >标记已读</button>
              <span v-else class="text-xs text-slate-400 dark:text-slate-500">已读</span>
            </div>
          </div>
          <p v-else class="mb-0 mt-3 text-sm text-slate-500 dark:text-slate-400">暂无共享通知</p>
        </section>

        <section>
          <h3 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100">任务邀请</h3>
          <div v-if="taskInvites.length" class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="invite in taskInvites" :key="invite.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="flex min-w-0 items-center gap-3">
                <Avatar :username="invite.inviterUsername" :size="32" />
                <div class="min-w-0">
                  <p class="m-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{{ invite.taskTitle }}</p>
                  <p class="m-0 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {{ invite.inviterUsername }} 邀请你{{ invite.permission === 'editor' ? '编辑' : '查看' }}
                  </p>
                </div>
              </div>
              <div class="flex gap-2">
                <button type="button" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" @click="handleTaskInvite(invite.id, 'reject')">拒绝</button>
                <button type="button" class="min-h-10 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700" @click="handleTaskInvite(invite.id, 'accept')">接受</button>
              </div>
            </div>
          </div>
          <p v-else class="mb-0 mt-3 text-sm text-slate-500 dark:text-slate-400">暂无任务邀请</p>
        </section>

        <section>
          <h3 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100">待对方处理的邀请</h3>
          <div v-if="sentTaskInvites.length" class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="invite in sentTaskInvites" :key="invite.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="flex min-w-0 items-center gap-3">
                <Avatar :username="invite.recipientUsername || '未知用户'" :size="32" />
                <div class="min-w-0">
                  <p class="m-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{{ invite.taskTitle }}</p>
                  <p class="m-0 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    已邀请 {{ invite.recipientUsername || '用户' }} {{ invite.permission === 'editor' ? '编辑' : '查看' }} · {{ new Date(invite.expiresAt).toLocaleString() }} 过期
                  </p>
                </div>
              </div>
              <button type="button" class="min-h-10 rounded-md border border-rose-200 px-3 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30" @click="handleRevokeSentInvite(invite.id)">撤回</button>
            </div>
          </div>
          <p v-else class="mb-0 mt-3 text-sm text-slate-500 dark:text-slate-400">暂无待对方处理的邀请</p>
        </section>

        <section>
          <h3 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100">信任申请</h3>
          <div v-if="receivedTrustRequests.length" class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="request in receivedTrustRequests" :key="request.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="flex items-center gap-3">
                <Avatar :username="request.username" :size="32" />
                <span class="text-sm text-slate-700 dark:text-slate-200">{{ request.username }} 请求建立信任</span>
              </div>
              <div class="flex gap-2">
                <button type="button" class="min-h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" @click="handleTrustRequest(request.id, 'reject')">拒绝</button>
                <button type="button" class="min-h-10 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700" @click="handleTrustRequest(request.id, 'accept')">建立信任</button>
              </div>
            </div>
          </div>
          <p v-else class="mb-0 mt-3 text-sm text-slate-500 dark:text-slate-400">暂无信任申请</p>
        </section>

        <form class="border-t border-slate-100 pt-5 dark:border-slate-800" @submit.prevent="redeemCode">
          <label for="share-code" class="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">兑换共享码</label>
          <div class="flex gap-2">
            <input id="share-code" v-model="shareCode" type="text" autocomplete="off" class="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" placeholder="输入 16 位共享码" />
            <button type="submit" :disabled="!shareCode.trim()" class="min-h-11 shrink-0 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">兑换</button>
          </div>
        </form>
      </div>

      <div v-else-if="activeTab === 'shares'" class="mt-5 space-y-6">
        <div class="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label="共享记录方向">
          <button
            id="sent-shares-tab"
            type="button"
            role="tab"
            aria-controls="sent-shares-panel"
            :aria-selected="activeShareDirection === 'sent'"
            class="flex min-h-10 items-center gap-2 rounded px-3 text-sm font-medium transition-colors"
            :class="activeShareDirection === 'sent' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
            @click="activeShareDirection = 'sent'"
          >
            我发起的
            <span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-600">{{ sentShareEvents.length }}</span>
          </button>
          <button
            id="received-shares-tab"
            type="button"
            role="tab"
            aria-controls="received-shares-panel"
            :aria-selected="activeShareDirection === 'received'"
            class="flex min-h-10 items-center gap-2 rounded px-3 text-sm font-medium transition-colors"
            :class="activeShareDirection === 'received' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
            @click="activeShareDirection = 'received'"
          >
            我收到的
            <span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-600">{{ receivedShareEvents.length }}</span>
          </button>
        </div>

        <section v-if="activeShareDirection === 'sent'" id="sent-shares-panel" role="tabpanel" aria-labelledby="sent-shares-tab">
          <h3 class="sr-only">发起的共享</h3>
          <div v-if="sentShareEvents.length" class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="event in sentShareEvents" :key="event.id" class="flex flex-wrap items-center gap-3 py-3">
              <Avatar :username="shareEventCounterparty(event)" :size="32" />
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{{ shareEventDescription(event) }}</p>
                <p class="m-0 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ event.action === 'shared' ? (event.permission === 'editor' ? '可编辑' : '仅查看') : '共享变更' }} · {{ new Date(event.createdAt).toLocaleString() }}
                </p>
              </div>
              <button
                v-if="event.taskAvailable"
                type="button"
                class="min-h-10 shrink-0 rounded-md px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                @click="emit('openTask', event.taskId)"
              >打开任务</button>
              <span v-else-if="!event.taskExists" class="text-xs text-slate-400 dark:text-slate-500">任务已删除</span>
              <span v-else class="text-xs text-slate-400 dark:text-slate-500">
                {{ event.action === 'revoked' ? '共享已取消' : event.action === 'left' ? '已退出共享' : '已无访问权限' }}
              </span>
            </div>
          </div>
          <p v-else class="mb-0 mt-3 text-sm text-slate-500 dark:text-slate-400">暂无发起记录</p>
        </section>

        <section v-else id="received-shares-panel" role="tabpanel" aria-labelledby="received-shares-tab">
          <h3 class="sr-only">我收到的共享</h3>
          <div v-if="receivedShareEvents.length" class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="event in receivedShareEvents" :key="event.id" class="flex flex-wrap items-center gap-3 py-3">
              <Avatar :username="shareEventCounterparty(event)" :size="32" />
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{{ shareEventDescription(event) }}</p>
                <p class="m-0 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ event.action === 'shared' ? (event.permission === 'editor' ? '可编辑' : '仅查看') : '共享变更' }} · {{ new Date(event.createdAt).toLocaleString() }}
                </p>
              </div>
              <button
                v-if="event.taskAvailable"
                type="button"
                class="min-h-10 shrink-0 rounded-md px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                @click="emit('openTask', event.taskId)"
              >打开任务</button>
              <span v-else-if="!event.taskExists" class="text-xs text-slate-400 dark:text-slate-500">任务已删除</span>
              <span v-else class="text-xs text-slate-400 dark:text-slate-500">
                {{ event.action === 'revoked' ? '共享已取消' : event.action === 'left' ? '已退出共享' : '已无访问权限' }}
              </span>
            </div>
          </div>
          <p v-else class="mb-0 mt-3 text-sm text-slate-500 dark:text-slate-400">暂无收到的共享</p>
        </section>
      </div>

      <div v-else class="mt-5 space-y-6">
        <form class="space-y-3" @submit.prevent="sendTrustRequest">
          <label for="trust-username" class="block text-sm font-medium text-slate-700 dark:text-slate-300">按用户名添加信任对象</label>
          <div class="flex gap-2">
            <input id="trust-username" v-model="username" type="text" autocomplete="off" class="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" placeholder="输入完整用户名" />
            <button type="submit" :disabled="!username.trim()" class="min-h-11 shrink-0 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">发送申请</button>
          </div>
        </form>

        <section>
          <h3 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100">已建立信任</h3>
          <div v-if="trustedUsers.length" class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="user in trustedUsers" :key="user.id" class="flex items-center justify-between gap-3 py-3">
              <div class="flex items-center gap-3">
                <Avatar :username="user.username" :size="32" />
                <span class="text-sm text-slate-700 dark:text-slate-200">{{ user.username }}</span>
              </div>
              <button type="button" class="min-h-10 rounded-md px-3 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" @click="removeTrustedUser(user)">解除信任</button>
            </div>
          </div>
          <p v-else class="mb-0 mt-3 text-sm text-slate-500 dark:text-slate-400">暂无信任对象</p>
        </section>

        <section v-if="receivedTrustRequests.length || sentTrustRequests.length">
          <h3 class="m-0 text-sm font-semibold text-slate-800 dark:text-slate-100">待处理申请</h3>
          <div class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="request in sentTrustRequests" :key="`sent-${request.id}`" class="flex items-center justify-between gap-3 py-3">
              <span class="text-sm text-slate-700 dark:text-slate-200">等待 {{ request.username }} 确认</span>
              <button type="button" class="min-h-10 rounded-md px-3 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" @click="handleTrustRequest(request.id, 'cancel')">撤回</button>
            </div>
            <div v-for="request in receivedTrustRequests" :key="`received-${request.id}`" class="flex items-center justify-between gap-3 py-3">
              <span class="text-sm text-slate-700 dark:text-slate-200">{{ request.username }} 的信任申请</span>
              <div class="flex gap-2">
                <button type="button" class="min-h-10 rounded-md px-3 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" @click="handleTrustRequest(request.id, 'reject')">拒绝</button>
                <button type="button" class="min-h-10 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700" @click="handleTrustRequest(request.id, 'accept')">接受</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <p v-if="loading" class="mb-0 mt-4 text-xs text-slate-500 dark:text-slate-400">正在同步协作信息…</p>
    </section>
  </div>
</template>
