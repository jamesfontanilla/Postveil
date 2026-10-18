import { SovereignDocTree, SovereignSchema, SovereignNode } from "./SovereignDocModel";
import { SovereignTransaction } from "./SovereignDocTransform";
import { type UniversalDoc, type DocBlock } from "../types";

export interface EditorSelection {
  activeBlockId: string | null;
  cursorOffset?: number;
}

export interface StateConfig {
  doc: SovereignDocTree;
  schema?: SovereignSchema;
  selection?: EditorSelection;
}

/**
 * Sovereign Editor State: Immutable snapshot of document state, schema, and undo/redo stacks
 */
export class SovereignEditorState {
  readonly doc: SovereignDocTree;
  readonly schema: SovereignSchema;
  readonly selection: EditorSelection;
  readonly undoStack: readonly SovereignTransaction[];
  readonly redoStack: readonly SovereignTransaction[];
  readonly maxHistory: number;

  constructor(
    doc: SovereignDocTree,
    schema = new SovereignSchema(),
    selection: EditorSelection = { activeBlockId: null },
    undoStack: readonly SovereignTransaction[] = [],
    redoStack: readonly SovereignTransaction[] = [],
    maxHistory = 100
  ) {
    this.doc = doc;
    this.schema = schema;
    this.selection = selection;
    this.undoStack = Object.freeze([...undoStack]);
    this.redoStack = Object.freeze([...redoStack]);
    this.maxHistory = maxHistory;
  }

  public static create(config: StateConfig): SovereignEditorState {
    const schema = config.schema || new SovereignSchema();
    return new SovereignEditorState(config.doc, schema, config.selection);
  }

  public static fromUniversalDoc(universalDoc: UniversalDoc): SovereignEditorState {
    const schema = new SovereignSchema();
    const docTree = SovereignDocTree.fromUniversalDoc(universalDoc, schema);
    const initialBlockId = docTree.nodes.length > 0 ? docTree.nodes[0].id : null;
    return new SovereignEditorState(docTree, schema, { activeBlockId: initialBlockId });
  }

  /**
   * Creates a new transaction originating from this state
   */
  public tr(): SovereignTransaction {
    return new SovereignTransaction(this.doc);
  }

  /**
   * Applies a transaction and returns a new immutable SovereignEditorState
   */
  public apply(tr: SovereignTransaction): SovereignEditorState {
    if (!tr.docChanged) {
      return this;
    }

    const nextUndoStack = [...this.undoStack, tr];
    if (nextUndoStack.length > this.maxHistory) {
      nextUndoStack.shift();
    }

    return new SovereignEditorState(
      tr.doc,
      this.schema,
      this.selection,
      nextUndoStack,
      [] // Clear redo on new transaction
    );
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Executes an undo operation via transaction inversion
   */
  public undo(): SovereignEditorState | null {
    if (!this.canUndo()) return null;

    const nextUndo = [...this.undoStack];
    const tr = nextUndo.pop()!;
    const invertedTr = tr.createInvertedTransaction();

    const nextRedo = [...this.redoStack, tr];

    return new SovereignEditorState(
      invertedTr.doc,
      this.schema,
      this.selection,
      nextUndo,
      nextRedo
    );
  }

  /**
   * Executes a redo operation
   */
  public redo(): SovereignEditorState | null {
    if (!this.canRedo()) return null;

    const nextRedo = [...this.redoStack];
    const tr = nextRedo.pop()!;

    // Reapply transaction steps
    const redoTr = new SovereignTransaction(this.doc);
    for (const step of tr.steps) {
      redoTr.step(step);
    }

    const nextUndo = [...this.undoStack, tr];

    return new SovereignEditorState(
      redoTr.doc,
      this.schema,
      this.selection,
      nextUndo,
      nextRedo
    );
  }

  /**
   * Sets the active selection
   */
  public setSelection(selection: EditorSelection): SovereignEditorState {
    return new SovereignEditorState(
      this.doc,
      this.schema,
      selection,
      this.undoStack,
      this.redoStack
    );
  }

  /**
   * Exports the document state back to UniversalDoc block array
   */
  public toDocBlocks(): DocBlock[] {
    return this.doc.toDocBlocks();
  }
}
