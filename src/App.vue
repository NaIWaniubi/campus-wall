<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import AnnouncementDialog from '@/components/AnnouncementDialog.vue'

const appStore = useAppStore()
const userStore = useUserStore()

onMounted(async () => {
  await appStore.fetchSections()
  if (userStore.isLoggedIn) {
    appStore.fetchUnreadCount().catch(() => {})
  }
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50">
    <RouterView v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
    <AnnouncementDialog />
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
