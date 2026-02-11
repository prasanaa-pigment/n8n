<script setup lang="ts">
import type { JsonSchemaValue } from 'n8n-workflow';
import { ref, watch } from 'vue';
import JsonEditor from '@/features/shared/editors/components/JsonEditor/JsonEditor.vue';

interface Props {
	modelValue: JsonSchemaValue;
	isReadOnly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	isReadOnly: false,
});

const emit = defineEmits<{
	'update:model-value': [schema: JsonSchemaValue];
}>();

const rawJson = ref(JSON.stringify(props.modelValue, null, 2));

watch(
	() => props.modelValue,
	(newValue) => {
		const newJson = JSON.stringify(newValue, null, 2);
		if (newJson !== rawJson.value) {
			rawJson.value = newJson;
		}
	},
);

function onEditorUpdate(value: string): void {
	rawJson.value = value;
	try {
		const parsed = JSON.parse(value) as unknown;
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			(parsed as Record<string, unknown>).type === 'object'
		) {
			emit('update:model-value', parsed as JsonSchemaValue);
		}
	} catch {
		// Invalid JSON — silently ignore until the user fixes it.
		// The JsonEditor already shows inline lint errors.
	}
}
</script>

<template>
	<div :class="$style.container" data-test-id="raw-schema-input">
		<JsonEditor
			:model-value="rawJson"
			:is-read-only="isReadOnly"
			:rows="10"
			@update:model-value="onEditorUpdate"
		/>
	</div>
</template>

<style lang="scss" module>
.container {
	display: flex;
	flex-direction: column;
}
</style>
