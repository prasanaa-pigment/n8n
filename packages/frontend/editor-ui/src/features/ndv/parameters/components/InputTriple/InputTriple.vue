<script setup lang="ts">
import { useElementSize } from '@vueuse/core';
import { computed, ref } from 'vue';

type Props = {
	middleWidth?: string;
};
withDefaults(defineProps<Props>(), { middleWidth: '160px' });

const STACKED_BREAKPOINT = 400;
const containerRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(containerRef);
const isStacked = computed(() => width.value > 0 && width.value <= STACKED_BREAKPOINT);
</script>

<template>
	<div ref="containerRef" :class="$style.container">
		<div :class="$style.items">
			<div v-if="$slots.left" :class="[$style.item, $style.itemFirst]">
				<slot name="left" :is-stacked="isStacked"></slot>
			</div>
			<div
				v-if="$slots.middle"
				:class="[$style.item, $style.itemMiddle]"
				:style="{ '--input-triple--width': middleWidth }"
			>
				<slot name="middle" :is-stacked="isStacked"></slot>
			</div>
			<div v-if="$slots.right" :class="[$style.item, $style.itemLast]">
				<slot name="right" :is-stacked="isStacked"></slot>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.container {
	--parameter-input-options--height: 22px;
	container: input-triple / inline-size;
	isolation: isolate;
	width: 100%;
}

.items {
	display: flex;
	flex-wrap: wrap;
}

.item {
	position: relative;
	flex: 1;
	min-width: 0;

	input {
		box-sizing: content-box;
	}

	:global(.n8n-input) {
		gap: 0;
	}

	&:focus-within {
		z-index: 1;
	}
}

.itemMiddle {
	margin: 0 -1px;
	flex-basis: var(--input-triple--width, 160px);
	flex-grow: 0;
}

.itemFirst {
	input,
	:global(.cm-editor) {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}

	// Expression input: fx icon keeps left radius, cm-editor has no radius
	// TODO: .el-input-group__prepend is an Element Plus class. When removing Element Plus,
	// copy its styles to ExpressionParameterInput.vue and FromAiOverrideField.vue,
	// then replace with a semantic class like .n8n-input-prepend
	:global(.el-input-group__prepend) {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}

	:global(.el-input-group__prepend + * .cm-editor) {
		border-radius: 0;
	}
}

.itemLast {
	input,
	:global(.cm-editor) {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}

	// Expression input: fx icon has no left radius, cm-editor keeps right radius
	:global(.el-input-group__prepend) {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}

	:global(.el-input-group__prepend ~ button) {
		border-bottom-right-radius: var(--radius);
	}
}

// Stacked layout when container is narrow
@container input-triple (max-width: 400px) {
	.item {
		flex-basis: 100%;
		margin: 0;
		margin-top: -1px;

		&:first-child {
			margin-top: 0;
		}

		// Hide options row for middle items only (first shows at top, last shows at bottom)
		&:not(:first-child):not(:last-child) {
			--parameter-input-options--height: 0;
		}
	}

	.itemMiddle {
		flex-basis: 100%;
	}

	.itemFirst input,
	.itemFirst :global(.cm-editor) {
		border-radius: var(--radius) var(--radius) 0 0;
	}

	// Expression input in first item: fx icon top-left, cm-editor top-right only
	.itemFirst :global(.el-input-group__prepend) {
		border-radius: var(--radius) 0 0 0;
	}

	.itemFirst :global(.el-input-group__prepend + * .cm-editor) {
		border-radius: 0 var(--radius) 0 0;
	}

	.itemMiddle input,
	.itemMiddle :global(.cm-editor),
	.itemMiddle :global(.el-input-group__prepend) {
		border-radius: 0;
	}

	.itemLast input,
	.itemLast :global(.cm-editor) {
		border-radius: 0 0 var(--radius) var(--radius);
	}

	// Expression input in last item: fx icon bottom-left, modal opener bottom-right
	.itemLast :global(.el-input-group__prepend) {
		border-radius: 0 0 0 var(--radius);
	}

	.itemLast :global(.el-input-group__prepend + * .cm-editor) {
		border-bottom-left-radius: 0;
	}
}
</style>
