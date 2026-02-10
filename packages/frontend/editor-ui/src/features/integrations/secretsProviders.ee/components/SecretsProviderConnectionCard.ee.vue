<script lang="ts" setup>
import { computed, toRef } from 'vue';
import SecretsProviderImage from './SecretsProviderImage.ee.vue';
import { N8nActionToggle, N8nBadge, N8nCard, N8nHeading, N8nText } from '@n8n/design-system';
import type { SecretProviderConnection, SecretProviderTypeResponse } from '@n8n/api-types';
import { DateTime } from 'luxon';
import { isDateObject } from '@/app/utils/typeGuards';
import { useI18n } from '@n8n/i18n';
import { useRBACStore } from '@/app/stores/rbac.store';
import { useProjectsStore } from '@/features/collaboration/projects/projects.store';
import ProjectCardBadge from '@/features/collaboration/projects/components/ProjectCardBadge.vue';
import { ResourceType } from '@/features/collaboration/projects/projects.utils';
import { ProjectTypes } from '@/features/collaboration/projects/projects.types';

const i18n = useI18n();
const rbacStore = useRBACStore();
const projectsStore = useProjectsStore();

const props = defineProps<{
	provider: SecretProviderConnection;
	providerTypeInfo?: SecretProviderTypeResponse;
	canUpdate: boolean;
}>();

const emit = defineEmits<{
	edit: [providerKey: string];
	share: [providerKey: string];
	delete: [providerKey: string];
}>();

const provider = toRef(props, 'provider');
const providerTypeInfo = toRef(props, 'providerTypeInfo');

const formattedDate = computed(() => {
	return DateTime.fromISO(
		isDateObject(provider.value.createdAt)
			? provider.value.createdAt.toISOString()
			: provider.value.createdAt || new Date().toISOString(),
	).toFormat('dd LLL yyyy');
});

const showDisconnectedBadge = computed(() => {
	return provider.value.state === 'error';
});

const canDelete = computed(() => rbacStore.hasScope('externalSecretsProvider:delete'));

const resourceTypeLabel = computed(() =>
	i18n.baseText('settings.secretsProviderConnections.resourceType').toLowerCase(),
);

// Adapt provider data structure for ProjectCardBadge
const adaptedProviderData = computed(() => ({
	id: provider.value.id,
	name: provider.value.name,
	type: provider.value.type,
	homeProject: provider.value.projects[0]
		? { ...provider.value.projects[0], type: ProjectTypes.Team }
		: null,
	sharedWithProjects: provider.value.projects
		.slice(1)
		.map((p) => ({ ...p, type: ProjectTypes.Team })),
	scopes: provider.value.projects.length > 0 ? [] : ['global'],
	isGlobal: provider.value.projects.length === 0,
}));

const actionDropdownOptions = computed(() => {
	if (!props.canUpdate) return [];

	const options = [
		{
			label: i18n.baseText('generic.edit'),
			value: 'edit',
		},
		{
			label: i18n.baseText('settings.secretsProviderConnections.actions.share'),
			value: 'share',
		},
	];

	if (canDelete.value) {
		options.push({
			label: i18n.baseText('generic.delete'),
			value: 'delete',
		});
	}

	return options;
});

function onAction(action: string) {
	if (action === 'edit') {
		emit('edit', provider.value.name);
	} else if (action === 'share') {
		emit('share', provider.value.name);
	} else if (action === 'delete') {
		emit('delete', provider.value.name);
	}
}
</script>

<template>
	<N8nCard :class="$style.card" hoverable>
		<template v-if="providerTypeInfo" #prepend>
			<SecretsProviderImage
				:class="$style.providerImage"
				:provider="providerTypeInfo"
				data-test-id="secrets-provider-image"
			/>
		</template>
		<template #header>
			<div :class="$style.headerContainer">
				<N8nHeading tag="h2" bold data-test-id="secrets-provider-name">{{
					provider.name
				}}</N8nHeading>
				<N8nBadge
					v-if="showDisconnectedBadge"
					theme="warning"
					:bold="false"
					size="xsmall"
					data-test-id="disconnected-badge"
				>
					{{ i18n.baseText('settings.secretsProviderConnections.state.disconnected') }}
				</N8nBadge>
			</div>
		</template>
		<template #default>
			<N8nText class="pb-4xs" color="text-light" size="small">
				<span data-test-id="secrets-provider-display-name">
					{{ providerTypeInfo?.displayName ?? provider.type }}
				</span>
				|
				<span data-test-id="secrets-provider-secrets-count">
					{{
						provider.secretsCount === 1
							? i18n.baseText('settings.externalSecrets.card.secretCount', {
									interpolate: {
										count: `${provider.secretsCount}`,
									},
								})
							: i18n.baseText('settings.externalSecrets.card.secretsCount', {
									interpolate: {
										count: `${provider.secretsCount ?? 0}`,
									},
								})
					}}
				</span>
				|
				<span data-test-id="secrets-provider-created-at">
					{{
						i18n.baseText('settings.secretsProviderConnections.card.createdAt', {
							interpolate: {
								date: formattedDate,
							},
						})
					}}
				</span>
			</N8nText>
		</template>
		<template #append>
			<ProjectCardBadge
				:class="$style.cardBadge"
				:resource="adaptedProviderData"
				:resource-type="ResourceType.ExternalSecretsProvider"
				:resource-type-label="resourceTypeLabel"
				:personal-project="projectsStore.personalProject"
				:show-badge-border="false"
				:global="adaptedProviderData.isGlobal"
			/>
			<N8nActionToggle
				:actions="actionDropdownOptions"
				data-test-id="secrets-provider-action-toggle"
				@action="onAction"
			/>
		</template>
	</N8nCard>
</template>

<style lang="css" module>
.card {
	--card--padding: var(--spacing--2xs);
	padding-left: var(--spacing--sm);
}

.providerImage {
	width: 100%;
	height: 100%;
}

.headerContainer {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
}

.cardBadge {
	margin-right: var(--spacing--3xs);
}
</style>
