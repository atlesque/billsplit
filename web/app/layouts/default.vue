<template>
  <div>
    <header class="sticky top-0 z-10 border-b border-default bg-default/85 backdrop-blur">
      <div class="mx-auto flex items-center justify-between gap-3 px-4 py-2.5" :class="wide ? 'max-w-6xl' : 'max-w-3xl'">
        <NuxtLink to="/" class="flex items-center gap-2 text-lg font-bold text-highlighted">
          <img src="/icon.svg" alt="" width="28" height="28" />
          BillSplit
        </NuxtLink>
        <div class="flex min-w-0 items-center gap-1.5">
          <LanguageSwitcher />
          <!-- Shown when /api/me says so; the Worker decides who is an admin. -->
          <UButton v-if="me && isAdmin" href="/admin" external variant="ghost" color="neutral" size="sm" :label="$t('account.admin')" />
          <UButton
            v-if="me"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-circle-user-round"
            class="max-w-48"
            :title="me.email"
            :label="me.name || me.email"
            :ui="{ label: 'truncate' }"
            @click="openAccount"
          />
        </div>
      </div>
    </header>
    <main class="mx-auto px-4 pt-5 pb-12" :class="wide ? 'max-w-6xl' : 'max-w-3xl'">
      <SignedOutHome v-if="gate === 'signin'" />
      <NameStep v-else-if="gate === 'name'" />
      <slot v-else />
    </main>
  </div>
</template>

<script setup lang="ts">
import { AccountModal } from "#components";

const route = useRoute();
const { me, isAdmin } = useSession();
const overlay = useOverlay();
const accountModal = overlay.create(AccountModal);
const openAccount = () => accountModal.open();

const wide = computed(() => route.path.startsWith("/admin"));

// Which screen to show: sign-in links and invite pages work signed out; everything else
// needs a session, and a first sign-in asks for a name before anything else.
const gate = computed(() => {
  if (route.path === "/signin") return "page";
  if (route.path.startsWith("/join/") && (!me.value || me.value.name)) return "page";
  if (!me.value) return "signin";
  if (!me.value.name) return "name";
  return "page";
});
</script>
