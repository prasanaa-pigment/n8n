<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import Modal from '@/app/components/Modal.vue';
import { N8nButton, N8nText, N8nIcon } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useTelemetry } from '@/app/composables/useTelemetry';
import { useUIStore } from '@/app/stores/ui.store';
import { useCredentialsStore } from '../../credentials.store';
import { useNDVStore } from '@/features/ndv/shared/ndv.store';
import { useWorkflowsStore } from '@/app/stores/workflows.store';
import { QUICK_CONNECT_MODAL_KEY } from '../../credentials.constants';
import { getAppNameFromCredType } from '@/app/utils/nodeTypesUtils';
import { isOAuthCredential } from './essentialFields';
import QuickConnectForm from './QuickConnectForm.vue';
import CredentialIcon from '../CredentialIcon.vue';

const props = defineProps<{
	modalName: string;
}>();

const emit = defineEmits<{
	credentialCreated: [credentialId: string];
}>();

const i18n = useI18n();
const telemetry = useTelemetry();
const uiStore = useUIStore();
const credentialsStore = useCredentialsStore();
const ndvStore = useNDVStore();
const workflowsStore = useWorkflowsStore();

const modalOpenedAt = ref<number>(0);
const state = ref<'form' | 'success' | 'error'>('form');
const errorMessage = ref('');
const createdCredentialId = ref<string | null>(null);
const usedAdvancedSettings = ref(false);

const modalData = computed(() => {
	const modal = uiStore.modalsById[QUICK_CONNECT_MODAL_KEY];
	return modal?.data as { credentialType: string; mode: string } | undefined;
});

const credentialType = computed(() => {
	if (!modalData.value?.credentialType) return null;
	return credentialsStore.getCredentialTypeByName(modalData.value.credentialType);
});

const appName = computed(() => {
	if (!credentialType.value) return '';
	return (
		getAppNameFromCredType(credentialType.value.displayName) || credentialType.value.displayName
	);
});

const isOAuth = computed(() => {
	if (!modalData.value?.credentialType) return false;
	return isOAuthCredential(modalData.value.credentialType);
});

const activeNode = computed(() => ndvStore.activeNode);

onMounted(() => {
	modalOpenedAt.value = Date.now();
	telemetry.track('credential_quick_connect_modal_opened', {
		credential_type: modalData.value?.credentialType,
		node_type: activeNode.value?.type,
		is_oauth: isOAuth.value,
		workflow_id: workflowsStore.workflowId,
	});
});

onUnmounted(() => {
	if (state.value === 'form') {
		telemetry.track('credential_quick_connect_abandoned', {
			credential_type: modalData.value?.credentialType,
			node_type: activeNode.value?.type,
			stage: 'before_connect',
		});
	}
});

function closeModal() {
	uiStore.closeModal(QUICK_CONNECT_MODAL_KEY);
}

function onSuccess(credentialId: string) {
	createdCredentialId.value = credentialId;
	state.value = 'success';

	telemetry.track('credential_quick_connect_completed', {
		credential_type: modalData.value?.credentialType,
		node_type: activeNode.value?.type,
		time_to_complete_ms: Date.now() - modalOpenedAt.value,
		used_advanced_settings: usedAdvancedSettings.value,
		workflow_id: workflowsStore.workflowId,
	});
}

function onError(message: string) {
	errorMessage.value = message;
	state.value = 'error';

	telemetry.track('credential_quick_connect_failed', {
		credential_type: modalData.value?.credentialType,
		node_type: activeNode.value?.type,
		error_type: 'connection_failed',
		opened_full_settings: false,
		workflow_id: workflowsStore.workflowId,
	});
}

function onRetry() {
	state.value = 'form';
	errorMessage.value = '';
}

function openFullSettings() {
	telemetry.track('credential_quick_connect_failed', {
		credential_type: modalData.value?.credentialType,
		node_type: activeNode.value?.type,
		error_type: 'user_opened_full_settings',
		opened_full_settings: true,
		workflow_id: workflowsStore.workflowId,
	});

	closeModal();
	if (modalData.value?.credentialType) {
		uiStore.openNewCredential(modalData.value.credentialType, true);
	}
}

function onDone() {
	if (createdCredentialId.value) {
		emit('credentialCreated', createdCredentialId.value);
	}
	closeModal();
}
</script>

<template>
	<Modal
		:name="props.modalName"
		:center="true"
		:show-close="true"
		width="400px"
		:custom-class="$style.modal"
	>
		<template #header>
			<div :class="$style.header">
				<CredentialIcon
					v-if="credentialType"
					:credential-type-name="credentialType.name"
					:size="32"
				/>
				<div :class="$style.headerText">
					<N8nText :bold="true" size="large">
						{{ i18n.baseText('quickConnect.title', { interpolate: { appName } }) }}
					</N8nText>
					<N8nText size="small" color="text-light">
						{{ i18n.baseText('quickConnect.subtitle') }}
					</N8nText>
				</div>
			</div>
		</template>

		<template #content>
			<!-- Success State -->
			<div v-if="state === 'success'" :class="$style.successState">
				<div :class="$style.successIcon">
					<N8nIcon icon="circle-check" size="xlarge" color="success" />
				</div>
				<N8nText :bold="true" size="large">
					{{ i18n.baseText('quickConnect.success.title') }}
				</N8nText>
				<N8nText size="small" color="text-light">
					{{ i18n.baseText('quickConnect.success.subtitle', { interpolate: { appName } }) }}
				</N8nText>
			</div>

			<!-- Error State -->
			<div v-else-if="state === 'error'" :class="$style.content">
				<div :class="$style.errorBanner">
					<N8nIcon icon="triangle-alert" color="danger" />
					<N8nText size="small">
						{{ errorMessage || i18n.baseText('quickConnect.error.default') }}
					</N8nText>
				</div>
				<QuickConnectForm
					v-if="credentialType && modalData"
					:credential-type="credentialType"
					:credential-type-name="modalData.credentialType"
					@success="onSuccess"
					@error="onError"
				/>
			</div>

			<!-- Form State -->
			<div v-else :class="$style.content">
				<QuickConnectForm
					v-if="credentialType && modalData"
					:credential-type="credentialType"
					:credential-type-name="modalData.credentialType"
					@success="onSuccess"
					@error="onError"
				/>
			</div>
		</template>

		<template #footer>
			<div :class="$style.footer">
				<template v-if="state === 'success'">
					<N8nButton
						:label="i18n.baseText('quickConnect.done')"
						type="primary"
						data-test-id="quick-connect-done-button"
						@click="onDone"
					/>
				</template>
				<template v-else-if="state === 'error'">
					<N8nButton
						:label="i18n.baseText('quickConnect.openFullSettings')"
						type="secondary"
						data-test-id="quick-connect-full-settings-button"
						@click="openFullSettings"
					/>
					<N8nButton
						:label="i18n.baseText('quickConnect.tryAgain')"
						type="primary"
						data-test-id="quick-connect-retry-button"
						@click="onRetry"
					/>
				</template>
				<template v-else>
					<N8nButton
						:label="i18n.baseText('quickConnect.cancel')"
						type="tertiary"
						data-test-id="quick-connect-cancel-button"
						@click="closeModal"
					/>
				</template>
			</div>
		</template>
	</Modal>
</template>

<style lang="scss" module>
.modal {
	:global(.el-dialog__body) {
		padding: var(--spacing--sm) var(--spacing--lg);
	}
}

.header {
	display: flex;
	align-items: center;
	gap: var(--spacing--sm);
}

.headerText {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
}

.successState {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	padding: var(--spacing--xl) 0;
	gap: var(--spacing--xs);
}

.successIcon {
	margin-bottom: var(--spacing--sm);
}

.errorBanner {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	padding: var(--spacing--xs) var(--spacing--sm);
	background-color: var(--color--danger--tint-4);
	border-radius: var(--radius);
	border: 1px solid var(--color--danger--tint-3);
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: var(--spacing--xs);
}
</style>
