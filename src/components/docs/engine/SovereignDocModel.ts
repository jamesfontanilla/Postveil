import {
  type BlockType,
  type InlineMark,
  type InlineSpan,
  type TableRow,
  type CalloutVariant,
  type DocBlock,
  type UniversalDoc,
} from "../types";

/**
 * Sovereign Mark Spec: Immutable representation of an inline formatting mark
 */
export class SovereignMark {
  readonly type: InlineMark["type"];
  readonly value?: string;

  constructor(type: InlineMark["type"], value?: string) {
    this.type = type;
    this.value = value;
  }

  public isInSet(set: SovereignMark[]): boolean {
    return set.some((m) => m.type === this.type && m.value === this.value);
  }

  public removeFromSet(set: SovereignMark[]): SovereignMark[] {
    return set.filter((m) => !(m.type === this.type && m.value === this.value));
  }

  public addToSet(set: SovereignMark[]): SovereignMark[] {
    if (this.isInSet(set)) return set;
    return [...set, this];
  }

  public toJSON(): InlineMark {
    return {
      type: this.type,
      value: this.value,
    };
  }
}

/**
 * Node Type Specification for the Sovereign Document Schema
 */
export interface SovereignNodeSpec {
  isBlock: boolean;
  isInline: boolean;
  isLeaf?: boolean;
  allowedMarks?: Array<InlineMark["type"]>;
  defaultAttrs?: Record<string, unknown>;
}

/**
 * Sovereign Schema: Defines the structural hierarchy and formatting rules
 */
export class SovereignSchema {
  readonly nodeSpecs: Record<string, SovereignNodeSpec>;
  readonly markSpecs: Record<string, { inclusive?: boolean }>;

  constructor() {
    this.nodeSpecs = {
      doc: { isBlock: true, isInline: false },
      paragraph: {
        isBlock: true,
        isInline: false,
        allowedMarks: ["bold", "italic", "underline", "strike", "code", "highlight", "link", "sub", "sup", "font"],
      },
      heading: {
        isBlock: true,
        isInline: false,
        allowedMarks: ["bold", "italic", "underline", "strike", "highlight", "link", "font"],
        defaultAttrs: { level: 2 },
      },
      bulletList: { isBlock: true, isInline: false },
      orderedList: { isBlock: true, isInline: false },
      taskList: {
        isBlock: true,
        isInline: false,
        defaultAttrs: { checked: false },
      },
      blockquote: { isBlock: true, isInline: false },
      codeBlock: {
        isBlock: true,
        isInline: false,
        isLeaf: true,
        defaultAttrs: { language: "typescript" },
      },
      table: { isBlock: true, isInline: false },
      mathBlock: {
        isBlock: true,
        isInline: false,
        isLeaf: true,
        defaultAttrs: { latex: "" },
      },
      callout: {
        isBlock: true,
        isInline: false,
        defaultAttrs: { calloutVariant: "note", calloutTitle: "NOTE" },
      },
      divider: { isBlock: true, isInline: false, isLeaf: true },
      pageBreak: { isBlock: true, isInline: false, isLeaf: true },
      columnBreak: { isBlock: true, isInline: false, isLeaf: true },
      image: {
        isBlock: true,
        isInline: false,
        isLeaf: true,
        defaultAttrs: { imageUrl: "", imageWidth: "100%", imageAlign: "center" },
      },
      toc: { isBlock: true, isInline: false, isLeaf: true, defaultAttrs: { tocStyle: "dotted" } },
    };

    this.markSpecs = {
      bold: { inclusive: true },
      italic: { inclusive: true },
      underline: { inclusive: true },
      strike: { inclusive: true },
      code: { inclusive: false },
      highlight: { inclusive: true },
      link: { inclusive: false },
      sub: { inclusive: true },
      sup: { inclusive: true },
      font: { inclusive: true },
    };
  }

  public isValidNodeType(type: string): type is BlockType {
    return type in this.nodeSpecs;
  }
}

/**
 * Sovereign Node: An immutable AST node in the document hierarchy
 */
export class SovereignNode {
  readonly id: string;
  readonly type: BlockType;
  readonly content: string;
  readonly level?: 1 | 2 | 3 | 4 | 5 | 6;
  readonly checked?: boolean;
  readonly language?: string;
  readonly calloutVariant?: CalloutVariant;
  readonly calloutTitle?: string;
  readonly latex?: string;
  readonly rows?: TableRow[];
  readonly imageUrl?: string;
  readonly imageAlt?: string;
  readonly imageWidth?: string;
  readonly imageAlign?: "left" | "center" | "right";
  readonly tocStyle?: "dotted" | "links";
  readonly spans: InlineSpan[];

  constructor(block: DocBlock) {
    this.id = block.id;
    this.type = block.type;
    this.content = block.content || "";
    this.level = block.level;
    this.checked = block.checked;
    this.language = block.language;
    this.calloutVariant = block.calloutVariant;
    this.calloutTitle = block.calloutTitle;
    this.latex = block.latex;
    this.rows = block.rows ? JSON.parse(JSON.stringify(block.rows)) : undefined;
    this.imageUrl = block.imageUrl;
    this.imageAlt = block.imageAlt;
    this.imageWidth = block.imageWidth;
    this.imageAlign = block.imageAlign;
    this.tocStyle = block.tocStyle;
    this.spans = block.spans ? JSON.parse(JSON.stringify(block.spans)) : [{ text: this.content }];
  }

  public toDocBlock(): DocBlock {
    return {
      id: this.id,
      type: this.type,
      content: this.content,
      level: this.level,
      checked: this.checked,
      language: this.language,
      calloutVariant: this.calloutVariant,
      calloutTitle: this.calloutTitle,
      latex: this.latex,
      rows: this.rows ? JSON.parse(JSON.stringify(this.rows)) : undefined,
      imageUrl: this.imageUrl,
      imageAlt: this.imageAlt,
      imageWidth: this.imageWidth,
      imageAlign: this.imageAlign,
      tocStyle: this.tocStyle,
      spans: this.spans ? JSON.parse(JSON.stringify(this.spans)) : undefined,
    };
  }

  public withAttrs(attrs: Partial<DocBlock>): SovereignNode {
    return new SovereignNode({
      ...this.toDocBlock(),
      ...attrs,
    });
  }

  public withContent(newContent: string): SovereignNode {
    return new SovereignNode({
      ...this.toDocBlock(),
      content: newContent,
      latex: this.type === "mathBlock" ? newContent : this.latex,
      spans: [{ text: newContent }],
    });
  }
}

/**
 * Sovereign Document Tree: An immutable collection of sovereign nodes
 */
export class SovereignDocTree {
  readonly nodes: readonly SovereignNode[];
  readonly schema: SovereignSchema;

  constructor(nodes: SovereignNode[], schema = new SovereignSchema()) {
    this.nodes = Object.freeze([...nodes]);
    this.schema = schema;
  }

  public static fromUniversalDoc(doc: UniversalDoc, schema = new SovereignSchema()): SovereignDocTree {
    const nodes = (doc.blocks || []).map((b) => new SovereignNode(b));
    return new SovereignDocTree(nodes, schema);
  }

  public toDocBlocks(): DocBlock[] {
    return this.nodes.map((n) => n.toDocBlock());
  }

  public findNode(id: string): SovereignNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  public findIndex(id: string): number {
    return this.nodes.findIndex((n) => n.id === id);
  }

  public nodeAt(index: number): SovereignNode | undefined {
    return this.nodes[index];
  }

  public get nodeCount(): number {
    return this.nodes.length;
  }

  public replaceNode(id: string, updated: SovereignNode): SovereignDocTree {
    const idx = this.findIndex(id);
    if (idx === -1) return this;
    const nextNodes = [...this.nodes];
    nextNodes[idx] = updated;
    return new SovereignDocTree(nextNodes, this.schema);
  }

  public insertAfter(afterId: string, node: SovereignNode): SovereignDocTree {
    const idx = this.findIndex(afterId);
    const nextNodes = [...this.nodes];
    if (idx >= 0) {
      nextNodes.splice(idx + 1, 0, node);
    } else {
      nextNodes.push(node);
    }
    return new SovereignDocTree(nextNodes, this.schema);
  }

  public deleteNode(id: string): SovereignDocTree {
    if (this.nodes.length <= 1) return this; // Preserve at least one node
    const nextNodes = this.nodes.filter((n) => n.id !== id);
    return new SovereignDocTree(nextNodes, this.schema);
  }
}
