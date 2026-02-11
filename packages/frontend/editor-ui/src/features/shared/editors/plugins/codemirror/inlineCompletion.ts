import { type Extension, StateEffect, StateField } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	keymap,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from '@codemirror/view';

const setInlineCompletion = StateEffect.define<string | null>();

class InlineCompletionWidget extends WidgetType {
	constructor(readonly text: string) {
		super();
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.textContent = this.text;
		span.style.color = 'var(--color--text--tint-1)';
		span.style.opacity = '0.8';
		span.style.pointerEvents = 'none';
		span.className = 'cm-inline-completion';
		return span;
	}

	eq(other: InlineCompletionWidget): boolean {
		return this.text === other.text;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

interface InlineCompletionState {
	completion: string | null;
	pos: number | null;
}

const inlineCompletionField = StateField.define<InlineCompletionState>({
	create(): InlineCompletionState {
		return { completion: null, pos: null };
	},

	update(value, tr): InlineCompletionState {
		for (const effect of tr.effects) {
			if (effect.is(setInlineCompletion)) {
				if (effect.value === null) {
					return { completion: null, pos: null };
				}
				return {
					completion: effect.value,
					pos: tr.state.selection.main.head,
				};
			}
		}

		if (tr.docChanged || tr.selection) {
			return { completion: null, pos: null };
		}

		return value;
	},

	provide(field) {
		return EditorView.decorations.from(field, (state) => {
			if (!state.completion || state.pos === null) {
				return Decoration.none;
			}

			const widget = Decoration.widget({
				widget: new InlineCompletionWidget(state.completion),
				side: 1,
			});

			return Decoration.set([widget.range(state.pos)]);
		});
	},
});

export function clearInlineCompletion(view: EditorView): void {
	view.dispatch({ effects: setInlineCompletion.of(null) });
}

export function showInlineCompletion(view: EditorView, text: string): void {
	view.dispatch({ effects: setInlineCompletion.of(text) });
}

export type InlineCompletionProvider = (
	codeBeforeCursor: string,
	codeAfterCursor: string,
) => Promise<string | null>;

export function inlineCompletion(provider: InlineCompletionProvider): Extension {
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let generation = 0;

	const plugin = ViewPlugin.fromClass(
		class {
			update(update: ViewUpdate): void {
				if (!update.docChanged) return;

				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
				}

				generation++;
				const currentGeneration = generation;

				debounceTimer = setTimeout(() => {
					const { state } = update.view;
					const pos = state.selection.main.head;
					const doc = state.doc.toString();
					const codeBeforeCursor = doc.slice(0, pos);
					const codeAfterCursor = doc.slice(pos);

					if (codeBeforeCursor.trim().length === 0) return;

					void provider(codeBeforeCursor, codeAfterCursor).then((result) => {
						if (currentGeneration !== generation) return;
						if (!result) return;
						if (update.view.hasFocus) {
							showInlineCompletion(update.view, result);
						}
					});
				}, 500);
			}

			destroy(): void {
				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
				}
			}
		},
	);

	const completionKeymap = keymap.of([
		{
			key: 'Tab',
			run(view) {
				const fieldState = view.state.field(inlineCompletionField);
				if (!fieldState.completion || fieldState.pos === null) {
					return false;
				}

				view.dispatch({
					changes: {
						from: fieldState.pos,
						insert: fieldState.completion,
					},
					effects: setInlineCompletion.of(null),
					selection: { anchor: fieldState.pos + fieldState.completion.length },
				});
				return true;
			},
		},
		{
			key: 'Escape',
			run(view) {
				const fieldState = view.state.field(inlineCompletionField);
				if (!fieldState.completion) {
					return false;
				}
				clearInlineCompletion(view);
				return true;
			},
		},
	]);

	return [inlineCompletionField, plugin, completionKeymap];
}
