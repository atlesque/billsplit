<template>
  <PageSpinner v-if="pending" />
  <ErrorState v-else-if="error" :error="error" />
  <UCard v-else-if="invite" class="mx-auto max-w-md">
    <p class="mb-1 text-xs font-bold tracking-wider text-primary uppercase">
      {{ invite.invitedBy ? $t("invite.invitedBy", { name: invite.invitedBy }) : $t("invite.invited") }}
    </p>
    <h1 class="text-2xl font-bold break-words text-highlighted">{{ invite.group.name }}</h1>
    <p v-if="invite.group.description" class="mt-1 text-muted">{{ invite.group.description }}</p>

    <div v-if="invite.status !== 'active'" class="mt-4">
      <p class="mb-4"><strong>{{ $t("invite.deadTitle") }}</strong> {{ $t("invite.deadHelp") }}</p>
      <UButton to="/" color="neutral" variant="outline" :label="$t('invite.home')" />
    </div>

    <div v-else-if="!me" class="mt-5">
      <SignInForm :next="`/join/${token}`" :title="$t('signin.toJoin')" />
    </div>

    <UForm v-else :state="state" class="mt-5 space-y-4" @submit="join">
      <UFormField v-if="invite.openPeople.length" :label="$t('invite.onList')" name="who">
        <URadioGroup v-model="state.who" :items="whoItems" variant="card" class="mt-1" />
      </UFormField>
      <UFormField v-if="state.who === NEW" :label="$t('invite.nameInGroup')" name="newName">
        <UInput v-model="state.newName" maxlength="60" class="w-full" />
      </UFormField>
      <p v-if="joinError" class="text-sm text-error">{{ joinError }}</p>
      <UButton type="submit" block size="lg" :label="$t('invite.join')" :loading="busy" />
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
interface Invite {
  status: string;
  alreadyMember?: boolean;
  groupId?: string;
  signedIn: boolean;
  invitedBy: string | null;
  group: { name: string; description: string };
  openPeople: { id: string; name: string }[];
  suggestedMemberId: string | null;
}

const NEW = "new";
const route = useRoute();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { me } = useSession();
const token = computed(() => String(route.params.token));
const state = reactive({ who: NEW, newName: me.value?.name ?? "" });
const joinError = ref("");
const busy = ref(false);

// Reload when the session changes, e.g. after signing in on this page.
const { data: invite, error, pending } = useLoad(async () => {
  const res = await api<Invite>(`/invites/${token.value}`);
  if (res.alreadyMember) {
    await navigateTo(`/g/${res.groupId}`, { replace: true });
    return null;
  }
  state.who = res.suggestedMemberId ?? NEW;
  state.newName = me.value?.name ?? "";
  return res;
}, () => [token.value, me.value?.id]);

const whoItems = computed(() => [
  ...(invite.value?.openPeople ?? []).map((p) => ({ label: t("invite.iAm", { name: p.name }), value: p.id })),
  { label: t("invite.notOnList"), value: NEW },
]);

async function join() {
  joinError.value = "";
  busy.value = true;
  try {
    const body = state.who === NEW ? { name: state.newName } : { memberId: state.who };
    const { id } = await api<{ id: string }>(`/invites/${token.value}/join`, { method: "POST", body });
    toast.add({ title: t("invite.joined"), color: "success" });
    await navigateTo(`/g/${id}`, { replace: true });
  } catch (err) {
    joinError.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
