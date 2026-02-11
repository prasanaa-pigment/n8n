<script setup lang="ts">
import { useI18n } from '@n8n/i18n';
import type { JsonSchemaValue } from 'n8n-workflow';
import { ref } from 'vue';
import { jsonExampleToSchema } from './utils';
import JsonEditor from '@/features/shared/editors/components/JsonEditor/JsonEditor.vue';

import { N8nButton, N8nCallout } from '@n8n/design-system';

interface Props {
	isReadOnly?: boolean;
	allFieldsRequired?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	isReadOnly: false,
	allFieldsRequired: false,
});

const emit = defineEmits<{
	schemaGenerated: [schema: JsonSchemaValue];
}>();

const i18n = useI18n();
const exampleJson = ref('{\n\t"some_input": "some_value"\n}');
const error = ref('');

function onEditorUpdate(value: string): void {
	exampleJson.value = value;
	error.value = '';
}

function generateSchema(): void {
	error.value = '';
	try {
		const schema = jsonExampleToSchema(exampleJson.value, props.allFieldsRequired);
		emit('schemaGenerated', schema);
	} catch (e) {
		error.value = (e as Error).message;
	}
}
</script>

<template>
	<div :class="$style.container" data-test-id="json-example-input">
		<JsonEditor
			:model-value="exampleJson"
			:is-read-only="isReadOnly"
			:rows="6"
			@update:model-value="onEditorUpdate"
		/>
		<N8nCallout v-if="error" theme="danger" :class="$style.error">
			{{ error }}
		</N8nCallout>
		<N8nButton
			v-if="!isReadOnly"
			:label="i18n.baseText('jsonSchemaBuilder.generateFromExample')"
			type="secondary"
			size="small"
			data-test-id="json-example-generate"
			@click="generateSchema"
		/>
	</div>
</template>

<style lang="scss" module>
.container {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.error {
	font-size: var(--font-size--2xs);
}
</style>
