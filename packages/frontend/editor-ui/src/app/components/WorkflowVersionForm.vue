<script setup lang="ts">
import {
	WORKFLOW_VERSION_NAME_MAX_LENGTH,
	WORKFLOW_VERSION_DESCRIPTION_MAX_LENGTH,
} from '@n8n/api-types';
import { N8nButton, N8nInput, N8nInputLabel, N8nTooltip } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useTemplateRef } from 'vue';

defineProps<{
	disabled?: boolean;
	versionNameTestId?: string;
	descriptionTestId?: string;
	showAiGenerate?: boolean;
	aiGenerateLoading?: boolean;
}>();

const versionName = defineModel<string>('versionName', { required: true });
const description = defineModel<string>('description', { required: true });
const nameInputRef = useTemplateRef<InstanceType<typeof N8nInput>>('nameInput');

const i18n = useI18n();

const emit = defineEmits<{
	submit: [];
	generateWithAi: [];
}>();

const focusInput = () => {
	// highlight the value in the input
	nameInputRef.value?.select();
};

const handleEnterKey = () => {
	emit('submit');
};

defineExpose({
	focusInput,
});
</script>

<template>
	<div :class="$style.formContainer">
		<div :class="$style.nameRow">
			<N8nInputLabel
				input-name="workflow-version-name"
				:label="i18n.baseText('workflows.publishModal.versionNameLabel')"
				:required="true"
				:class="$style.inputWrapper"
			>
				<N8nInput
					id="workflow-version-name"
					ref="nameInput"
					v-model="versionName"
					:disabled="disabled"
					size="large"
					:maxlength="WORKFLOW_VERSION_NAME_MAX_LENGTH"
					:data-test-id="versionNameTestId"
					@keydown.enter="handleEnterKey"
				/>
			</N8nInputLabel>
			<N8nTooltip
				v-if="showAiGenerate"
				:content="i18n.baseText('workflows.publishModal.generateWithAi')"
				placement="top"
			>
				<N8nButton
					:class="$style.aiButton"
					type="tertiary"
					size="large"
					:loading="aiGenerateLoading"
					icon="sparkles"
					square
					data-test-id="workflow-version-generate-ai-button"
					@click="emit('generateWithAi')"
				/>
			</N8nTooltip>
		</div>
		<N8nInputLabel
			input-name="workflow-version-description"
			:label="i18n.baseText('workflows.publishModal.descriptionPlaceholder')"
		>
			<N8nInput
				id="workflow-version-description"
				v-model="description"
				type="textarea"
				:rows="4"
				:disabled="disabled"
				size="large"
				:maxlength="WORKFLOW_VERSION_DESCRIPTION_MAX_LENGTH"
				:data-test-id="descriptionTestId"
			/>
		</N8nInputLabel>
	</div>
</template>

<style lang="scss" module>
.formContainer {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--lg);
}

.nameRow {
	display: flex;
	align-items: flex-end;
	gap: var(--spacing--xs);
}

.inputWrapper {
	width: 100%;
	flex: 1;
}

.aiButton {
	flex-shrink: 0;
}
</style>
