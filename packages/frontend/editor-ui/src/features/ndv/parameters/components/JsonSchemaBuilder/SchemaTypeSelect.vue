<script setup lang="ts">
import { useI18n } from '@n8n/i18n';
import type { BaseTextKey } from '@n8n/i18n';
import { SCHEMA_PROPERTY_TYPES } from './constants';
import { computed, useCssModule } from 'vue';
import { Primitive } from 'reka-ui';

import { N8nIcon } from '@n8n/design-system';
import {
	N8nDropdownMenu,
	type DropdownMenuItemProps,
} from '@n8n/design-system/v2/components/DropdownMenu';

interface Props {
	modelValue: string;
	isReadOnly?: boolean;
	allowedTypes?: readonly string[];
}

const props = withDefaults(defineProps<Props>(), {
	isReadOnly: false,
	allowedTypes: undefined,
});

const emit = defineEmits<{
	'update:model-value': [type: string];
}>();

const i18n = useI18n();
const $style = useCssModule();

const filteredTypes = computed(() => {
	if (!props.allowedTypes) return SCHEMA_PROPERTY_TYPES;
	return SCHEMA_PROPERTY_TYPES.filter((t) => props.allowedTypes!.includes(t.type));
});

const selectedType = computed(() =>
	filteredTypes.value.find((type) => type.type === props.modelValue),
);

const menuItems = computed<Array<DropdownMenuItemProps<string>>>(() => {
	return filteredTypes.value.map((type) => ({
		id: type.type,
		label: i18n.baseText(`jsonSchemaBuilder.type.${type.type}` as BaseTextKey),
		icon: { type: 'icon' as const, value: type.icon },
		checked: type.type === props.modelValue,
		class: type.type === props.modelValue ? $style.selected : '',
	}));
});

const onSelect = (type: string): void => {
	emit('update:model-value', type);
};
</script>

<template>
	<div :class="$style.wrapper" data-test-id="schema-type-select">
		<N8nDropdownMenu
			:items="menuItems"
			:disabled="isReadOnly"
			placement="bottom-start"
			:extra-popper-class="$style.dropdownContent"
			@select="onSelect"
		>
			<template #trigger>
				<Primitive as="button" type="button" :class="$style.trigger" :disabled="isReadOnly">
					<N8nIcon
						v-if="selectedType?.icon"
						:icon="selectedType.icon"
						color="text-light"
						size="small"
					/>
					<span :class="$style.label">{{
						i18n.baseText(`jsonSchemaBuilder.type.${modelValue}` as BaseTextKey)
					}}</span>
					<N8nIcon icon="chevron-down" color="text-light" size="small" />
				</Primitive>
			</template>
		</N8nDropdownMenu>
	</div>
</template>

<style lang="scss" module>
.wrapper {
	width: 100%;
	height: 100%;
}

.trigger {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
	width: 100%;
	height: 100%;
	min-height: 30px;
	padding: 0 var(--spacing--2xs);
	border: var(--border-width) var(--border-style) var(--input--border-color, var(--border-color));
	border-radius: var(--input--radius, var(--radius));
	background-color: var(--color--background--light-2);
	color: var(--color--text);
	font-size: var(--font-size--2xs);
	font-family: var(--font-family);
	cursor: pointer;

	&:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
}

.label {
	flex: 1;
	text-align: left;
	font-weight: var(--font-weight--regular);
}

.selected span {
	color: var(--color--primary);
	font-weight: var(--font-weight--bold);
}

.dropdownContent {
	z-index: var(--ndv--z);
}
</style>
