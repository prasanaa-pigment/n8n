<script setup lang="ts">
import Modal from '@/app/components/Modal.vue';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { N8nButton, N8nInlineTextEdit } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { createEventBus } from '@n8n/utils/event-bus';
import type { INode } from 'n8n-workflow';
import { ref } from 'vue';
import ToolSettingsContent from './ToolSettingsContent.vue';

const props = defineProps<{
	modalName: string;
	data: {
		node: INode | null;
		existingToolNames?: string[];
		onConfirm: (configuredNode: INode) => void;
	};
}>();

const i18n = useI18n();

const modalBus = ref(createEventBus());
const contentRef = ref<InstanceType<typeof ToolSettingsContent> | null>(null);
const isValid = ref(false);
const nodeName = ref(props.data.node?.name ?? '');

function handleConfirm() {
	const currentNode = contentRef.value?.node;
	if (!currentNode) {
		return;
	}

	props.data.onConfirm(currentNode);
	modalBus.value.emit('close');
}

function handleCancel() {
	modalBus.value.emit('close');
}

function handleChangeName(name: string) {
	contentRef.value?.handleChangeName(name);
}

function handleValidUpdate(valid: boolean) {
	isValid.value = valid;
}

function handleNodeNameUpdate(name: string) {
	nodeName.value = name;
}
</script>

<template>
	<Modal
		v-if="data.node"
		:name="modalName"
		:event-bus="modalBus"
		width="710px"
		:center="true"
		max-width="90vw"
		min-height="250px"
		max-height="650px"
		:class="$style.modal"
	>
		<template #header>
			<div :class="$style.header">
				<NodeIcon
					v-if="contentRef?.nodeTypeDescription"
					:node-type="contentRef.nodeTypeDescription"
					:size="24"
					:circle="true"
					:class="$style.icon"
				/>
				<N8nInlineTextEdit
					:model-value="nodeName"
					:max-width="400"
					:class="$style.title"
					@update:model-value="handleChangeName"
				/>
			</div>
		</template>
		<template #content>
			<ToolSettingsContent
				ref="contentRef"
				:initial-node="data.node"
				:existing-tool-names="data.existingToolNames"
				@update:valid="handleValidUpdate"
				@update:node-name="handleNodeNameUpdate"
			/>
		</template>
		<template #footer>
			<div :class="$style.footer">
				<N8nButton type="tertiary" @click="handleCancel">
					{{ i18n.baseText('chatHub.toolSettings.cancel') }}
				</N8nButton>
				<N8nButton type="primary" :disabled="!isValid" @click="handleConfirm">
					{{ i18n.baseText('chatHub.toolSettings.confirm') }}
				</N8nButton>
			</div>
		</template>
	</Modal>
</template>

<style lang="scss" module>
.modal {
	:global(.el-dialog__header) {
		width: 100%;
	}

	:global(.el-dialog__body) {
		padding: var(--spacing--sm) 0 var(--spacing--sm) var(--spacing--md);
	}

	:global(.modal-content) {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* don't show "This node must be connected to an AI agent." */
	:global(.ndv-connection-hint-notice) {
		display: none;
	}
}

.footer {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: var(--spacing--2xs);
	width: 100%;
	padding-right: var(--spacing--md);
}

.header {
	display: flex;
	gap: var(--spacing--2xs);
	align-items: center;
	min-width: 0;
}

.icon {
	flex-shrink: 0;
	flex-grow: 0;
}

.title {
	font-size: var(--font-size--md);
	font-weight: var(--font-weight--regular);
	line-height: var(--line-height--lg);
	color: var(--color--text--shade-1);
	flex: 1;
	min-width: 0;
}
</style>
