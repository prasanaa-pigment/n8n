<script setup lang="ts">
import { useI18n } from '@n8n/i18n';
import { ref, watch, computed } from 'vue';
import InputTriple from '../InputTriple/InputTriple.vue';
import SchemaTypeSelect from './SchemaTypeSelect.vue';
import { ARRAY_ITEM_TYPES, MAX_NESTING_DEPTH } from './constants';
import type { SchemaPropertyState } from './utils';
import { createEmptyProperty } from './utils';

import { N8nIconButton, N8nInput, N8nTooltip } from '@n8n/design-system';
import { ElSwitch } from 'element-plus';

interface Props {
	modelValue: SchemaPropertyState;
	isReadOnly?: boolean;
	depth?: number;
}

const props = withDefaults(defineProps<Props>(), {
	isReadOnly: false,
	depth: 0,
});

const emit = defineEmits<{
	'update:model-value': [value: SchemaPropertyState];
	remove: [];
}>();

const i18n = useI18n();
const property = ref<SchemaPropertyState>({ ...props.modelValue });

watch(
	() => props.modelValue,
	(newValue) => {
		property.value = { ...newValue };
	},
);

const canNest = computed(() => props.depth < MAX_NESTING_DEPTH);

const showNestedProperties = computed(
	() =>
		canNest.value &&
		(property.value.type === 'object' ||
			(property.value.type === 'array' && property.value.arrayItemType === 'object')),
);

const nestedProperties = computed(() => property.value.nestedProperties ?? []);

function emitUpdate(): void {
	emit('update:model-value', { ...property.value });
}

function onNameChange(value: string): void {
	property.value.name = value;
	emitUpdate();
}

function onTypeChange(type: string): void {
	property.value.type = type;
	if (type === 'array') {
		property.value.arrayItemType = property.value.arrayItemType ?? 'string';
	}
	if (type === 'object') {
		property.value.nestedProperties = property.value.nestedProperties ?? [];
	}
	if (type !== 'array') {
		delete property.value.arrayItemType;
	}
	if (type !== 'object' && !(type === 'array' && property.value.arrayItemType === 'object')) {
		delete property.value.nestedProperties;
	}
	delete property.value.enumValues;
	emitUpdate();
}

function onDescriptionChange(value: string): void {
	property.value.description = value;
	emitUpdate();
}

function onRequiredToggle(value: string | number | boolean): void {
	property.value.required = Boolean(value);
	emitUpdate();
}

function onArrayItemTypeChange(type: string): void {
	property.value.arrayItemType = type;
	if (type === 'object') {
		property.value.nestedProperties = property.value.nestedProperties ?? [];
	} else {
		delete property.value.nestedProperties;
	}
	emitUpdate();
}

function addNestedProperty(): void {
	if (!property.value.nestedProperties) {
		property.value.nestedProperties = [];
	}
	property.value.nestedProperties.push(createEmptyProperty());
	emitUpdate();
}

function updateNestedProperty(index: number, updated: SchemaPropertyState): void {
	if (property.value.nestedProperties) {
		property.value.nestedProperties[index] = updated;
		emitUpdate();
	}
}

function removeNestedProperty(index: number): void {
	property.value.nestedProperties?.splice(index, 1);
	emitUpdate();
}
</script>

<template>
	<div :class="$style.property" data-test-id="json-schema-property">
		<div :class="$style.row">
			<N8nIconButton
				v-if="!isReadOnly"
				type="tertiary"
				text
				size="small"
				icon="trash-2"
				data-test-id="json-schema-property-remove"
				:class="$style.removeButton"
				@click="$emit('remove')"
			/>

			<InputTriple :class="$style.fields" middle-width="200px">
				<template #left>
					<N8nInput
						:model-value="property.name"
						:placeholder="i18n.baseText('jsonSchemaBuilder.propertyName')"
						size="small"
						:disabled="isReadOnly"
						data-test-id="json-schema-property-name"
						@update:model-value="onNameChange"
					/>
				</template>

				<template #middle>
					<SchemaTypeSelect
						:model-value="property.type"
						:is-read-only="isReadOnly"
						@update:model-value="onTypeChange"
					/>
				</template>

				<template #right>
					<N8nInput
						:model-value="property.description"
						:placeholder="i18n.baseText('jsonSchemaBuilder.propertyDescription')"
						size="small"
						:disabled="isReadOnly"
						data-test-id="json-schema-property-description"
						@update:model-value="onDescriptionChange"
					/>
				</template>
			</InputTriple>

			<div :class="$style.requiredToggle">
				<N8nTooltip :content="i18n.baseText('jsonSchemaBuilder.propertyRequired')">
					<ElSwitch
						:model-value="property.required"
						:disabled="isReadOnly"
						size="small"
						data-test-id="json-schema-property-required"
						@update:model-value="onRequiredToggle"
					/>
				</N8nTooltip>
			</div>
		</div>

		<div v-if="property.type === 'array'" :class="$style.arrayItemType">
			<span :class="$style.arrayLabel">{{ i18n.baseText('jsonSchemaBuilder.arrayItemType') }}</span>
			<div :class="$style.arrayTypeSelect">
				<SchemaTypeSelect
					:model-value="property.arrayItemType ?? 'string'"
					:is-read-only="isReadOnly"
					:allowed-types="ARRAY_ITEM_TYPES"
					data-test-id="json-schema-array-item-type"
					@update:model-value="onArrayItemTypeChange"
				/>
			</div>
		</div>

		<div v-if="showNestedProperties" :class="$style.nested">
			<JsonSchemaProperty
				v-for="(nested, index) in nestedProperties"
				:key="nested.id"
				:model-value="nested"
				:is-read-only="isReadOnly"
				:depth="depth + 1"
				@update:model-value="(v) => updateNestedProperty(index, v)"
				@remove="removeNestedProperty(index)"
			/>
			<button
				v-if="!isReadOnly"
				:class="$style.addNested"
				type="button"
				data-test-id="json-schema-add-nested-property"
				@click="addNestedProperty"
			>
				{{ i18n.baseText('jsonSchemaBuilder.addChildProperty') }}
			</button>
		</div>
	</div>
</template>

<style lang="scss" module>
.property {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.row {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
}

.removeButton {
	flex-shrink: 0;
	opacity: 0;
	transition: opacity 100ms ease-in;

	.property:hover > .row > & {
		opacity: 1;
	}
}

.fields {
	flex-grow: 1;
	min-width: 0;
}

.requiredToggle {
	flex-shrink: 0;
}

.arrayItemType {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	padding-left: var(--spacing--xl);
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
}

.arrayLabel {
	white-space: nowrap;
}

.arrayTypeSelect {
	width: 120px;
}

.nested {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
	padding-left: var(--spacing--xl);
	border-left: 2px solid var(--color--foreground);
	margin-left: var(--spacing--xs);
}

.addNested {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
	padding: var(--spacing--4xs) var(--spacing--2xs);
	background: none;
	border: none;
	color: var(--color--primary);
	font-size: var(--font-size--2xs);
	font-family: var(--font-family);
	font-weight: var(--font-weight--bold);
	cursor: pointer;

	&:hover {
		color: var(--color--primary--shade-1);
	}
}
</style>
