<script setup lang="ts">
import { computed, ref } from 'vue';
import { N8nButton, N8nText, N8nIcon } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useCredentialsStore } from '../../credentials.store';
import CredentialIcon from '../CredentialIcon.vue';
import type { ProjectSharingData } from '@/features/collaboration/projects/projects.types';

export type CredentialOption = {
	id: string;
	name: string;
	typeDisplayName: string | undefined;
	homeProject?: ProjectSharingData;
};

const props = defineProps<{
	appName: string;
	credentialType: string;
	selectedCredentialId: string | null;
	credentialOptions: CredentialOption[];
	disabled?: boolean;
}>();

const emit = defineEmits<{
	connect: [];
	select: [credentialId: string];
}>();

const i18n = useI18n();
const credentialsStore = useCredentialsStore();

const showPopover = ref(false);

const selectedCredential = computed(() => {
	if (!props.selectedCredentialId) return null;
	return props.credentialOptions.find((c) => c.id === props.selectedCredentialId);
});

const otherCredentials = computed(() => {
	return props.credentialOptions.filter((c) => c.id !== props.selectedCredentialId);
});

const credentialTypeInfo = computed(() => {
	return credentialsStore.getCredentialTypeByName(props.credentialType);
});

function onConnect() {
	emit('connect');
}

function onSelectCredential(credentialId: string) {
	showPopover.value = false;
	emit('select', credentialId);
}

function onConnectAnother() {
	showPopover.value = false;
	emit('connect');
}
</script>

<template>
	<div :class="$style.container">
		<!-- Disconnected State -->
		<N8nButton
			v-if="!selectedCredential"
			:label="i18n.baseText('credentialConnectionStatus.connect', { interpolate: { appName } })"
			type="primary"
			size="small"
			:disabled="props.disabled"
			data-test-id="credential-connect-button"
			@click="onConnect"
		/>

		<!-- Connected State -->
		<div v-else :class="$style.connectedWrapper">
			<button
				type="button"
				:class="$style.connectionPill"
				:disabled="props.disabled"
				data-test-id="credential-connection-pill"
				@click="showPopover = !showPopover"
			>
				<CredentialIcon
					v-if="credentialTypeInfo"
					:credential-type-name="credentialTypeInfo.name"
					:size="16"
				/>
				<N8nText size="small" :bold="true" :class="$style.pillText">
					{{ selectedCredential.name }}
				</N8nText>
				<N8nIcon icon="check" size="small" :class="$style.checkIcon" />
				<N8nIcon icon="chevron-down" size="small" :class="$style.chevron" />
			</button>

			<div v-if="showPopover" :class="$style.popoverContent">
				<!-- Other credentials -->
				<div v-if="otherCredentials.length > 0" :class="$style.credentialsList">
					<button
						v-for="credential in otherCredentials"
						:key="credential.id"
						type="button"
						:class="$style.credentialItem"
						:data-test-id="`credential-option-${credential.id}`"
						@click="onSelectCredential(credential.id)"
					>
						<CredentialIcon
							v-if="credentialTypeInfo"
							:credential-type-name="credentialTypeInfo.name"
							:size="16"
						/>
						<div :class="$style.credentialInfo">
							<N8nText size="small" :bold="true">{{ credential.name }}</N8nText>
							<N8nText v-if="credential.homeProject" size="small" color="text-light">
								{{ credential.homeProject.name }}
							</N8nText>
						</div>
					</button>
				</div>

				<!-- Divider -->
				<div v-if="otherCredentials.length > 0" :class="$style.divider" />

				<!-- Connect another -->
				<button
					type="button"
					:class="$style.connectAnother"
					data-test-id="credential-connect-another"
					@click="onConnectAnother"
				>
					<N8nIcon icon="plus" size="small" />
					<N8nText size="small">
						{{
							i18n.baseText('credentialConnectionStatus.connectAnother', {
								interpolate: { appName },
							})
						}}
					</N8nText>
				</button>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.container {
	display: inline-flex;
}

.connectedWrapper {
	position: relative;
	display: inline-flex;
	flex-direction: column;
}

.connectionPill {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--3xs);
	padding: var(--spacing--4xs) var(--spacing--xs);
	background-color: var(--color--success--tint-4);
	border: 1px solid var(--color--success--tint-3);
	border-radius: var(--radius--lg);
	cursor: pointer;
	transition: all 0.2s ease;

	&:hover:not(:disabled) {
		background-color: var(--color--success--tint-3);
	}

	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
}

.pillText {
	max-width: 150px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.checkIcon {
	color: var(--color--success);
}

.chevron {
	color: var(--color--text--tint-1);
}

.popoverContent {
	position: absolute;
	top: 100%;
	left: 0;
	margin-top: var(--spacing--4xs);
	min-width: 250px;
	display: flex;
	flex-direction: column;
	background-color: var(--color--background);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	z-index: 100;
}

.credentialsList {
	display: flex;
	flex-direction: column;
	padding: var(--spacing--4xs) 0;
}

.credentialItem {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	padding: var(--spacing--xs) var(--spacing--sm);
	background: none;
	border: none;
	cursor: pointer;
	text-align: left;
	width: 100%;

	&:hover {
		background-color: var(--color--background--light-2);
	}
}

.credentialInfo {
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.divider {
	height: 1px;
	background-color: var(--color--foreground);
	margin: var(--spacing--4xs) 0;
}

.connectAnother {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	padding: var(--spacing--xs) var(--spacing--sm);
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color--primary);
	font-weight: var(--font-weight--bold);

	&:hover {
		background-color: var(--color--background--light-2);
	}
}
</style>
