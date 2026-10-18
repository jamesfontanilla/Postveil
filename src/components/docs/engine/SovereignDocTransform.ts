import {
  SovereignDocTree,
  SovereignNode,
  SovereignMark,
} from "./SovereignDocModel";
import { type BlockType, type DocBlock, type InlineSpan } from "../types";

export interface StepResult {
  doc: SovereignDocTree;
  failed?: string;
}

/**
 * Base Step: An atomic invertible transformation on a SovereignDocTree
 */
export abstract class SovereignStep {
  abstract apply(doc: SovereignDocTree): StepResult;
  abstract invert(prevDoc: SovereignDocTree): SovereignStep;
}

/**
 * Update Node Content Step
 */
export class UpdateContentStep extends SovereignStep {
  constructor(public readonly nodeId: string, public readonly newContent: string) {
    super();
  }

  apply(doc: SovereignDocTree): StepResult {
    const node = doc.findNode(this.nodeId);
    if (!node) return { doc, failed: `Node ${this.nodeId} not found` };
    const updated = node.withContent(this.newContent);
    return { doc: doc.replaceNode(this.nodeId, updated) };
  }

  invert(prevDoc: SovereignDocTree): SovereignStep {
    const prevNode = prevDoc.findNode(this.nodeId);
    return new UpdateContentStep(this.nodeId, prevNode ? prevNode.content : "");
  }
}

/**
 * Update Node Attributes Step (type, level, checked, variant, etc.)
 */
export class UpdateAttrStep extends SovereignStep {
  constructor(public readonly nodeId: string, public readonly attrs: Partial<DocBlock>) {
    super();
  }

  apply(doc: SovereignDocTree): StepResult {
    const node = doc.findNode(this.nodeId);
    if (!node) return { doc, failed: `Node ${this.nodeId} not found` };
    const updated = node.withAttrs(this.attrs);
    return { doc: doc.replaceNode(this.nodeId, updated) };
  }

  invert(prevDoc: SovereignDocTree): SovereignStep {
    const prevNode = prevDoc.findNode(this.nodeId);
    if (!prevNode) return new UpdateAttrStep(this.nodeId, {});
    const prevBlock = prevNode.toDocBlock();
    const inverseAttrs: Partial<DocBlock> = {};
    for (const key of Object.keys(this.attrs) as Array<keyof DocBlock>) {
      (inverseAttrs as Record<string, unknown>)[key] = prevBlock[key];
    }
    return new UpdateAttrStep(this.nodeId, inverseAttrs);
  }
}

/**
 * Insert Node Step
 */
export class InsertNodeStep extends SovereignStep {
  constructor(public readonly afterId: string, public readonly node: SovereignNode) {
    super();
  }

  apply(doc: SovereignDocTree): StepResult {
    return { doc: doc.insertAfter(this.afterId, this.node) };
  }

  invert(_prevDoc: SovereignDocTree): SovereignStep {
    return new DeleteNodeStep(this.node.id);
  }
}

/**
 * Delete Node Step
 */
export class DeleteNodeStep extends SovereignStep {
  constructor(public readonly nodeId: string) {
    super();
  }

  apply(doc: SovereignDocTree): StepResult {
    return { doc: doc.deleteNode(this.nodeId) };
  }

  invert(prevDoc: SovereignDocTree): SovereignStep {
    const idx = prevDoc.findIndex(this.nodeId);
    const prevNode = prevDoc.findNode(this.nodeId);
    if (!prevNode) return new UpdateAttrStep(this.nodeId, {});
    const afterId = idx > 0 ? prevDoc.nodes[idx - 1].id : "";
    return new InsertNodeStep(afterId, prevNode);
  }
}

/**
 * Update Spans/Marks Step
 */
export class UpdateSpansStep extends SovereignStep {
  constructor(public readonly nodeId: string, public readonly newSpans: InlineSpan[]) {
    super();
  }

  apply(doc: SovereignDocTree): StepResult {
    const node = doc.findNode(this.nodeId);
    if (!node) return { doc, failed: `Node ${this.nodeId} not found` };
    const updated = node.withAttrs({ spans: this.newSpans });
    return { doc: doc.replaceNode(this.nodeId, updated) };
  }

  invert(prevDoc: SovereignDocTree): SovereignStep {
    const prevNode = prevDoc.findNode(this.nodeId);
    return new UpdateSpansStep(this.nodeId, prevNode?.spans || []);
  }
}

/**
 * Sovereign Transaction: Groups steps into an atomic document transition
 */
export class SovereignTransaction {
  public doc: SovereignDocTree;
  public readonly steps: SovereignStep[] = [];
  public readonly docs: SovereignDocTree[] = [];
  public docChanged = false;
  public time = Date.now();
  public metadata: Record<string, unknown> = {};

  constructor(initialDoc: SovereignDocTree) {
    this.doc = initialDoc;
    this.docs.push(initialDoc);
  }

  /**
   * Appends and applies a step to the transaction
   */
  public step(step: SovereignStep): this {
    const result = step.apply(this.doc);
    if (!result.failed) {
      this.steps.push(step);
      this.docs.push(result.doc);
      this.doc = result.doc;
      this.docChanged = true;
    }
    return this;
  }

  /**
   * Updates content of a node
   */
  public updateContent(nodeId: string, content: string): this {
    return this.step(new UpdateContentStep(nodeId, content));
  }

  /**
   * Updates attributes of a node
   */
  public updateAttrs(nodeId: string, attrs: Partial<DocBlock>): this {
    return this.step(new UpdateAttrStep(nodeId, attrs));
  }

  /**
   * Inserts a new node
   */
  public insertNode(afterId: string, node: SovereignNode): this {
    return this.step(new InsertNodeStep(afterId, node));
  }

  /**
   * Deletes a node
   */
  public deleteNode(nodeId: string): this {
    return this.step(new DeleteNodeStep(nodeId));
  }

  /**
   * Sets custom transaction metadata
   */
  public setMeta(key: string, value: unknown): this {
    this.metadata[key] = value;
    return this;
  }

  /**
   * Inverts the transaction against the initial document state for undo
   */
  public createInvertedTransaction(): SovereignTransaction {
    const inverted = new SovereignTransaction(this.doc);
    // Apply inverted steps in reverse order
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const step = this.steps[i];
      const prevDoc = this.docs[i];
      const invStep = step.invert(prevDoc);
      inverted.step(invStep);
    }
    return inverted;
  }
}
