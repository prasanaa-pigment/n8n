<script setup lang="ts">
import Modal from '@/app/components/Modal.vue';
import { N8nHeading, N8nButton } from '@n8n/design-system';
import WorkflowVersionForm from '@/app/components/WorkflowVersionForm.vue';
import { useI18n } from '@n8n/i18n';
import { createEventBus } from '@n8n/utils/event-bus';
import { useUIStore } from '@/app/stores/ui.store';
import { useSettingsStore } from '@/app/stores/settings.store';
import { useWorkflowsStore } from '@/app/stores/workflows.store';
import { useRootStore } from '@n8n/stores/useRootStore';
import { useWorkflowHistoryStore } from '@/features/workflows/workflowHistory/workflowHistory.store';
import { useToast } from '@/app/composables/useToast';
import { generateVersionDescription } from '@/features/ai/assistant/assistant.api';
import type { GenerateVersionDescriptionRequest } from '@/features/ai/assistant/assistant.types';
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import { generateVersionName } from '@/features/workflows/workflowHistory/utils';
import type { EventBus } from '@n8n/utils/event-bus';

export type WorkflowVersionFormModalEventBusEvents = {
	submit: { versionId: string; name: string; description: string };
	cancel: undefined;
};

export type WorkflowVersionFormModalData = {
	versionId: string;
	versionName?: string;
	description?: string;
	modalTitle: string;
	submitButtonLabel: string;
	submitting?: boolean;
	eventBus: EventBus<WorkflowVersionFormModalEventBusEvents>;
};

const props = defineProps<{
	modalName: string;
	data: WorkflowVersionFormModalData;
}>();

const i18n = useI18n();
const modalEventBus = createEventBus();
const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const workflowsStore = useWorkflowsStore();
const rootStore = useRootStore();
const workflowHistoryStore = useWorkflowHistoryStore();
const { showError } = useToast();

const versionForm = useTemplateRef<InstanceType<typeof WorkflowVersionForm>>('versionForm');

const versionName = ref('');
const description = ref('');
const generatingAi = ref(false);

const submitting = computed(() => props.data.submitting ?? false);

const showAiGenerate = computed(() => settingsStore.isAskAiEnabled);

async function handleGenerateWithAi() {
	if (generatingAi.value) return;

	generatingAi.value = true;

	try {
		const currentVersion = {
			nodes: workflowsStore.allNodes,
			connections: workflowsStore.allConnections as Record<string, unknown>,
		};

		let previousVersion: GenerateVersionDescriptionRequest.WorkflowVersionPayload | undefined;

		const activeVersion = workflowsStore.workflow.activeVersion;
		if (activeVersion?.versionId && activeVersion.versionId !== props.data.versionId) {
			try {
				const prevVersionData = await workflowHistoryStore.getWorkflowVersion(
					workflowsStore.workflow.id,
					activeVersion.versionId,
				);
				previousVersion = {
					nodes: prevVersionData.nodes,
					connections: prevVersionData.connections as Record<string, unknown>,
				};
			} catch {
				// Continue without previous version if fetch fails
			}
		}

		const result = await generateVersionDescription(rootStore.restApiContext, {
			workflowName: workflowsStore.workflow.name,
			currentVersion,
			previousVersion,
		});

		versionName.value = result.name;
		description.value = result.description;
	} catch (error) {
		showError(error, i18n.baseText('workflows.publishModal.generateWithAi.error'));
	} finally {
		generatingAi.value = false;
	}
}

function onModalOpened() {
	versionForm.value?.focusInput();
}

onMounted(() => {
	if (props.data.versionName) {
		versionName.value = props.data.versionName;
	} else if (props.data.versionId) {
		versionName.value = generateVersionName(props.data.versionId);
	}

	if (props.data.description) {
		description.value = props.data.description;
	}

	modalEventBus.on('opened', onModalOpened);
});

onBeforeUnmount(() => {
	modalEventBus.off('opened', onModalOpened);
});

const closeModal = () => {
	uiStore.closeModal(props.modalName);
};

const onCancel = () => {
	props.data.eventBus.emit('cancel');
	closeModal();
};

const handleSubmit = () => {
	if (versionName.value.trim().length === 0) {
		return;
	}

	props.data.eventBus.emit('submit', {
		versionId: props.data.versionId,
		name: versionName.value,
		description: description.value,
	});
};
</script>

<template>
	<Modal
		width="500px"
		max-height="85vh"
		:name="modalName"
		:event-bus="modalEventBus"
		:center="true"
		:before-close="onCancel"
	>
		<template #header>
			<N8nHeading size="xlarge">{{ data.modalTitle }}</N8nHeading>
		</template>
		<template #content>
			<div :class="$style.content">
				<WorkflowVersionForm
					ref="versionForm"
					v-model:version-name="versionName"
					v-model:description="description"
					:version-name-test-id="`${modalName}-version-name-input`"
					:description-test-id="`${modalName}-description-input`"
					:show-ai-generate="showAiGenerate"
					:ai-generate-loading="generatingAi"
					@submit="handleSubmit"
					@generate-with-ai="handleGenerateWithAi"
				/>
				<div :class="$style.actions">
					<N8nButton
						:disabled="submitting"
						type="secondary"
						:label="i18n.baseText('generic.cancel')"
						:data-test-id="`${modalName}-cancel-button`"
						@click="onCancel"
					/>
					<N8nButton
						:loading="submitting"
						:disabled="versionName.trim().length === 0"
						:label="data.submitButtonLabel"
						:data-test-id="`${modalName}-submit-button`"
						@click="handleSubmit"
					/>
				</div>
			</div>
		</template>
	</Modal>
</template>
<style lang="scss" module>
.content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--lg);
}

.actions {
	display: flex;
	justify-content: flex-end;
	gap: var(--spacing--xs);
}
</style>
