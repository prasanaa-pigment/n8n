<script setup lang="ts">
import { useDebounce } from '@/app/composables/useDebounce';
import { useI18n } from '@n8n/i18n';
import isEqual from 'lodash/isEqual';
import type { JsonSchemaValue, INode, INodeProperties, NodeParameterValueType } from 'n8n-workflow';
import { computed, reactive, watch } from 'vue';
import JsonSchemaProperty from './JsonSchemaProperty.vue';
import JsonExampleInput from './JsonExampleInput.vue';
import RawSchemaInput from './RawSchemaInput.vue';
import type { SchemaPropertyState } from './utils';
import {
	createEmptyProperty,
	propertyStatesToJsonSchema,
	jsonSchemaToPropertyStates,
} from './utils';
import ParameterOptions from '../ParameterOptions.vue';

import { N8nInputLabel, N8nOption, N8nSelect } from '@n8n/design-system';

type SchemaMode = 'visual' | 'rawSchema' | 'jsonExample';

interface Props {
	parameter: INodeProperties;
	value: JsonSchemaValue;
	path: string;
	node: INode | null;
	isReadOnly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	isReadOnly: false,
});

const emit = defineEmits<{
	valueChanged: [value: { name: string; node: string; value: JsonSchemaValue }];
}>();

const i18n = useI18n();
const { callDebounced } = useDebounce();

const typeOptions = computed(() => props.parameter.typeOptions?.jsonSchema);
const allFieldsRequired = computed(() => typeOptions.value?.allFieldsRequired ?? false);

function initializeState(value: JsonSchemaValue): {
	properties: SchemaPropertyState[];
	schema: JsonSchemaValue;
	mode: SchemaMode;
} {
	return {
		properties: jsonSchemaToPropertyStates(value),
		schema: value ?? { type: 'object', properties: {} },
		mode: 'visual',
	};
}

const state = reactive(initializeState(props.value));

const empty = computed(() => state.properties.length === 0);

const actions = computed(() => {
	return [
		{
			label: i18n.baseText('jsonSchemaBuilder.clearAll'),
			value: 'clearAll',
			disabled: state.properties.length === 0,
		},
	];
});

const modeOptions = computed(() => [
	{ value: 'visual' as const, label: i18n.baseText('jsonSchemaBuilder.modeVisual') },
	{ value: 'rawSchema' as const, label: i18n.baseText('jsonSchemaBuilder.modeRawSchema') },
	{ value: 'jsonExample' as const, label: i18n.baseText('jsonSchemaBuilder.modeJsonExample') },
]);

watch(
	() => props.node,
	() => {
		const newState = initializeState(props.value);
		if (isEqual(state.schema, newState.schema)) return;
		state.properties = newState.properties;
		state.schema = newState.schema;
	},
);

function emitSchema(schema: JsonSchemaValue): void {
	state.schema = schema;
	void callDebounced(
		() => {
			emit('valueChanged', { name: props.path, value: schema, node: props.node?.name as string });
		},
		{ debounceTime: 1000 },
	);
}

function syncFromProperties(): void {
	const schema = propertyStatesToJsonSchema(state.properties);
	emitSchema(schema);
}

function addProperty(): void {
	state.properties.push(createEmptyProperty());
	syncFromProperties();
}

function updateProperty(index: number, value: SchemaPropertyState): void {
	state.properties[index] = value;
	syncFromProperties();
}

function removeProperty(index: number): void {
	state.properties.splice(index, 1);
	syncFromProperties();
}

function onExampleSchemaGenerated(schema: JsonSchemaValue): void {
	state.properties = jsonSchemaToPropertyStates(schema);
	emitSchema(schema);
	state.mode = 'visual';
}

function onRawSchemaUpdate(schema: JsonSchemaValue): void {
	state.properties = jsonSchemaToPropertyStates(schema);
	emitSchema(schema);
}

function switchMode(mode: string): void {
	if (mode === 'visual') {
		state.properties = jsonSchemaToPropertyStates(state.schema);
	}
	state.mode = mode as SchemaMode;
}

function optionSelected(action: string): void {
	if (action === 'clearAll') {
		state.properties = [];
		syncFromProperties();
	}
}
</script>

<template>
	<div
		:class="{ [$style.jsonSchemaBuilder]: true, [$style.empty]: empty }"
		:data-test-id="`json-schema-builder-${parameter.name}`"
	>
		<N8nInputLabel
			:label="parameter.displayName"
			:show-expression-selector="false"
			size="small"
			underline
			color="text-dark"
		>
			<template #options>
				<ParameterOptions
					:parameter="parameter"
					:value="value as unknown as NodeParameterValueType"
					:custom-actions="actions"
					:is-read-only="isReadOnly"
					:show-expression-selector="false"
					@update:model-value="optionSelected"
				/>
			</template>
		</N8nInputLabel>

		<N8nSelect
			:model-value="state.mode"
			size="small"
			:class="$style.modeSelect"
			@update:model-value="switchMode"
		>
			<N8nOption
				v-for="option in modeOptions"
				:key="option.value"
				:value="option.value"
				:label="option.label"
			/>
		</N8nSelect>

		<div :class="$style.content">
			<template v-if="state.mode === 'visual'">
				<div :class="$style.properties">
					<JsonSchemaProperty
						v-for="(prop, index) in state.properties"
						:key="prop.id"
						:model-value="prop"
						:is-read-only="isReadOnly"
						@update:model-value="(v) => updateProperty(index, v)"
						@remove="removeProperty(index)"
					/>
				</div>
				<div
					v-if="!isReadOnly"
					:class="$style.addArea"
					data-test-id="json-schema-add-property"
					@click="addProperty"
				>
					<span :class="$style.addButton">{{
						i18n.baseText('jsonSchemaBuilder.addProperty')
					}}</span>
				</div>
			</template>

			<template v-else-if="state.mode === 'jsonExample'">
				<JsonExampleInput
					:is-read-only="isReadOnly"
					:all-fields-required="allFieldsRequired"
					@schema-generated="onExampleSchemaGenerated"
				/>
			</template>

			<template v-else-if="state.mode === 'rawSchema'">
				<RawSchemaInput
					:model-value="state.schema"
					:is-read-only="isReadOnly"
					@update:model-value="onRawSchemaUpdate"
				/>
			</template>
		</div>
	</div>
</template>

<style lang="scss" module>
.jsonSchemaBuilder {
	display: flex;
	flex-direction: column;
	margin: var(--spacing--xs) 0;
}

.modeSelect {
	margin-top: var(--spacing--xs);
	margin-bottom: var(--spacing--xs);
}

.content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--xs);
}

.properties {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.addArea {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--spacing--2xs);
	cursor: pointer;
	min-height: 24px;
}

.addButton {
	color: var(--color--primary);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);

	&:hover {
		color: var(--color--primary--shade-1);
	}
}

.empty {
	.addArea {
		min-height: 10vh;
	}
}
</style>
