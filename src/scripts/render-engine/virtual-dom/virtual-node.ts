import { BindableString, AttributeData } from "../../types/html-data.js";
import { applySecurity, revokeSecurity, SecureOptions } from "../secure.js";
import { utilsLog } from "../../module-scope.js";

class PlaceholderClass implements VirtualBaseNode {}
type Constructor<I = PlaceholderClass> = new (...args: any[]) => I;

interface VirtualBaseNode {

  isNode?(): this is VirtualNode;
  isAttributeNode?(): this is VirtualAttributeNode;
  isChildNode?(): this is VirtualChildNode;
  isEventNode?(): this is VirtualEventNode;
  isParentNode?(): this is VirtualParentNode;
  isTextNode?(): this is VirtualTextNode;
  cloneTo?(to: this, deep?: boolean): void;
  
}

export interface VirtualNode extends VirtualBaseNode {

  readonly nodeName: string;
  cloneNode(deep?: boolean): this;
  /**
   * Creates a new empty node
   */
  createDom(defaultNamespace?: string): Node;

  isNode(): this is VirtualNode;
  isAttributeNode(): this is VirtualAttributeNode;
  isChildNode(): this is VirtualChildNode;
  isEventNode(): this is VirtualEventNode;
  isParentNode(): this is VirtualParentNode;
  isTextNode(): this is VirtualTextNode;
  
}

export function isVirtualNode(value: any): value is VirtualNode {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  if (typeof value.isNode !== 'function' || typeof value.createDom !== 'function' || typeof value.nodeName !== 'string') {
    return false;
  }
  return value.isNode();
}

function toRawString(strings: ReadonlyArray<Readonly<BindableString>>): string {
  const parts: string[] = [];

  for (const str of strings) {
    if (str.type === 'string') {
      parts.push(str.text);
    } else {
      if (str.bindMethod === 'raw') {
        parts.push('{{{');
      } else {
        parts.push('{{');
      }
      parts.push(str.text);
      if (str.bindMethod === 'raw') {
        parts.push('}}}');
      } else {
        parts.push('}}');
      }
    }
  }

  if (!parts.length) {
    return null;
  }
  return parts.join('');
}

//#region attribute
function VirtualAttributeNode<T extends Constructor>(clazz: T = PlaceholderClass as T) {
  return class extends clazz implements VirtualAttributeNode {
    readonly #attributes = new Map<string, AttributeData>();

    public getAttributeNames(): IterableIterator<string> {
      return this.#attributes.keys();
    }

    public hasAttribute(qualifiedName: string): boolean {
      return this.#attributes.has(qualifiedName?.toLowerCase());
    }

    public getAttribute(qualifiedName: string): any {
      return this.#attributes.get(qualifiedName?.toLowerCase());
    }
    
    public setAttribute(qualifiedName: string, value: any = ''): void {
      if (qualifiedName == null || qualifiedName === '')  {
        throw new Error(`qualifiedName needs to have a value. Found: "${qualifiedName}"`)
      }
      this.#attributes.set(qualifiedName?.toLowerCase(), value == null ? '' : value);
    }

    public removeAttribute(qualifiedName: string): void {
      this.#attributes.delete(qualifiedName?.toLowerCase());
    }

    public isAttributeNode(): this is VirtualAttributeNode {
      return true;
    }

    public cloneTo(to: this, deep?: boolean): void {
      for (const attrName of this.getAttributeNames()) {
        to.setAttribute(attrName, this.getAttribute(attrName));
      }
      // @ts-ignore
      super.cloneTo?.(to, deep);
    }
    
  }
}
export interface VirtualAttributeNode extends VirtualBaseNode {
  getAttributeNames(): IterableIterator<string>;
  hasAttribute(qualifiedName: string): boolean;
  getAttribute(qualifiedName: string): any | null;
  setAttribute(qualifiedName: string, value?: any | null): void;
  removeAttribute(qualifiedName: string): void;
  isAttributeNode(): this is VirtualAttributeNode;
}
//#endregion

//#region child
const setParentOnChild = Symbol('setParent');
function VirtualChildNode<T extends Constructor>(clazz: T = PlaceholderClass as any) {
  return class extends clazz implements VirtualChildNode {
    #parentNode: VirtualParentNode;
    get parentNode(): VirtualParentNode {
      return this.#parentNode;
    }
    [setParentOnChild](node: VirtualParentNode): void {
      this.#parentNode = node;
    }

    public previousSibling(): VirtualChildNode {
      if (!this.parentNode) {
        return undefined;
      }
      return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this as any) - 1];
    }

    public nextSibling(): VirtualChildNode {
      if (!this.parentNode) {
        return undefined;
      }
      return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this as any) + 1];
    }

    public getRootNode(): VirtualBaseNode {
      let node: VirtualBaseNode = this;
      while (node.isChildNode && node.isChildNode() && node.parentNode) {
        node = node.parentNode;
      }

      return node;
    }

    public after(...nodes: Array<VirtualChildNode & VirtualNode>): void {
      if (!this.parentNode) {
        return;
      }
      this.parentNode.insertAfter(this, ...nodes);
    }

    public before(...nodes: Array<VirtualChildNode & VirtualNode>): void {
      if (!this.parentNode) {
        return;
      }
      this.parentNode.insertBefore(this, ...nodes);
    }

    public remove(): void {
      if (!this.parentNode) {
        return;
      }
      this.parentNode.removeChild(this);
    }

    public replaceWith(...nodes: Array<VirtualChildNode & VirtualNode>): void {
      if (!this.parentNode) {
        return;
      }
      this.parentNode.replaceChild(this, ...nodes);
    }

    public isChildNode(): this is VirtualChildNode {
      return true;
    }

    public cloneTo(to: this, deep?: boolean): void {
      // Do nothing

      // @ts-ignore
      super.cloneTo?.(to, deep);
    }
  }
}
export interface VirtualChildNode extends VirtualBaseNode {
  readonly parentNode: VirtualParentNode;
  [setParentOnChild](node: VirtualParentNode): void;
  previousSibling(): VirtualChildNode;
  nextSibling(): VirtualChildNode;
  /**
   * Get the highest parent node
   */
  getRootNode(): VirtualBaseNode;
  /**
   * Inserts nodes just after node, while replacing strings in nodes with equivalent Text nodes.
   */
  after(...nodes: VirtualChildNode[]): void;
  /**
   * Inserts nodes just before node, while replacing strings in nodes with equivalent Text nodes.
   */
  before(...nodes: VirtualChildNode[]): void;
  /** 
   * Removes node.
   */
  remove(): void;
  /**
   * Replaces node with nodes, while replacing strings in nodes with equivalent Text nodes.
   */
  replaceWith(...nodes: VirtualChildNode[]): void;
  
  isChildNode(): this is VirtualChildNode;
}
//#endregion

//#region event
const eventCallbackId = Symbol('eventCallbackId');
let nextEventCallbackId = 0;
export interface StoredEventCallback {
  readonly type: string;
  readonly callback: EventListenerOrEventListenerObject;
  readonly guid: number;
  readonly options?: boolean | AddEventListenerOptions;
}
function VirtualEventNode<T extends Constructor>(clazz: T = PlaceholderClass as any) {
  return class extends clazz implements VirtualEventNode {
    #callbackMap = new Map<number, StoredEventCallback>();

    public getEventListeners(): Iterable<StoredEventCallback> {
      return this.#callbackMap.values();
    }

    public addEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
      if (callback[eventCallbackId] == null) {
        callback[eventCallbackId] = nextEventCallbackId++;
      }
      this.#callbackMap.set(callback[eventCallbackId], {type: type, callback: callback, options: options, guid: callback[eventCallbackId]});
    }

    public removeEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void {
      this.#callbackMap.delete(callback[eventCallbackId]);
    }

    public isEventNode(): this is VirtualEventNode {
      return true;
    }

    public cloneTo(to: this, deep?: boolean): void {
      for (const listener of this.getEventListeners()) {
        to.addEventListener(listener.callback[eventCallbackId], listener.callback);
      }

      // @ts-ignore
      super.cloneTo?.(to, deep);
    }

  }
}
export interface VirtualEventNode extends VirtualBaseNode {
  getEventListeners(): Iterable<StoredEventCallback>;
  addEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  isEventNode(): this is VirtualEventNode;
}
//#endregion

//#region parent
function VirtualParentNode<T extends Constructor>(clazz: T = PlaceholderClass as any) {
  return class extends clazz implements VirtualParentNode {
    #childNodesSecurity: SecureOptions = {write: false, throw: false};
    #childNodes: Array<VirtualChildNode & VirtualNode> = applySecurity([], this.#childNodesSecurity);
    get childNodes(): ReadonlyArray<VirtualChildNode & VirtualNode> {
      return this.#childNodes;
    }

    public firstChild(): VirtualChildNode & VirtualNode {
      return this.#childNodes[0];
    }

    public lastChild(): VirtualChildNode & VirtualNode {
      return this.#childNodes[this.#childNodes.length - 1];
    }

    public hasChildNodes(): boolean {
      return this.#childNodes.length > 0;
    }
    
    public appendChild(...nodes: Array<(VirtualChildNode & VirtualNode)>): void {
      this.#insertIndex('appendChild', this.#childNodes.length, nodes);
    }
    
    public prependChild(...nodes: Array<(VirtualChildNode & VirtualNode)>): void {
      this.#insertIndex('prependChild', 0, nodes);
    }
    
    public insertBefore(child: VirtualChildNode & VirtualNode, ...nodes: Array<VirtualChildNode & VirtualNode>): void {
      const index = this.#childNodes.indexOf(child);
      if (index === -1) {
        throw new Error(`Failed to execute 'insertBefore' on 'Node': The reference child is not a child of this node.`);
      }
      this.#insertIndex('insertBefore', index, nodes);
    }
    
    public insertAfter(child: VirtualChildNode & VirtualNode, ...nodes: Array<VirtualChildNode & VirtualNode>): void {
      const index = this.#childNodes.indexOf(child);
      if (index === -1) {
        throw new Error(`Failed to execute 'insertAfter' on 'Node': The reference child is not a child of this node.`);
      }
      this.#insertIndex('insertAfter', index + 1, nodes);
    }
    
    #insertIndex(method: string, index: number, nodes: Array<VirtualChildNode & VirtualNode>): void {
      for (const node of nodes) {
        if (node.parentNode != null) {
          throw new Error(`Failed to execute '${method}' on 'Node': The new child element contains the parent.`);
        }
      }

      this.#childNodesSecurity.write = true;
      this.#childNodes.splice(index, 0, ...nodes);
      this.#childNodesSecurity.write = false;
      for (const node of nodes) {
        node[setParentOnChild](this);
      }
    }
    
    public removeChild<T extends VirtualChildNode>(child: T): T {
      const index = this.#childNodes.indexOf(child as any);
      if (index === -1) {
        throw new Error(`Failed to execute 'removeChild' on 'Node': The reference child is not a child of this node.`);
      }

      child[setParentOnChild](null);
      this.#childNodesSecurity.write = true;
      this.#childNodes.splice(index, 1)
      this.#childNodesSecurity.write = false;
      return child;
    }
    
    public removeAllChildren(): Array<VirtualChildNode & VirtualNode> {
      const children = this.#childNodes;
      revokeSecurity(children, this.#childNodesSecurity);
      this.#childNodes = applySecurity([], this.#childNodesSecurity);
      for (const child of children) {
        child[setParentOnChild](null);
      }
      return children;
    }
    
    public replaceChild<T extends VirtualChildNode>(child: T, ...nodes: Array<VirtualChildNode & VirtualNode>): T {
      const index = this.#childNodes.indexOf(child as any);
      if (index === -1) {
        throw new Error(`Failed to execute 'replaceChild' on 'Node': The reference child is not a child of this node.`);
      }

      child[setParentOnChild](null);
      this.#childNodesSecurity.write = true;
      this.#childNodes.splice(index, 1, ...nodes)
      this.#childNodesSecurity.write = false;
      for (const node of nodes) {
        node[setParentOnChild](this);
      }
      return child;
    }
    
    public contains(other: VirtualNode): boolean {
      let node: VirtualBaseNode = other;
      while (node.isChildNode && node.isChildNode() && node.parentNode) {
        node = node.parentNode;
        if (node === this) {
          return true;
        }
      }

      return false;
    }

    public isParentNode(): this is VirtualParentNode {
      return true;
    }

    public cloneTo(to: this, deep?: boolean): void {
      if (!deep) {
        // @ts-ignore
        return super.cloneTo?.(to, deep);
      }
      const clones: Array<VirtualChildNode & VirtualNode> = [];
      for (const child of this.childNodes) {
        clones.push(child.cloneNode(true));
      }
      to.appendChild(...clones);

      // @ts-ignore
      super.cloneTo?.(to, deep);
    }
  }
}
export interface VirtualParentNode extends VirtualBaseNode {
  readonly childNodes: ReadonlyArray<VirtualChildNode & VirtualNode>;
  firstChild(): VirtualChildNode & VirtualNode;
  lastChild(): VirtualChildNode & VirtualNode;
  hasChildNodes(): boolean;
  /**
   * Inserts nodes or texts after the last child of this node
   */
  appendChild(...nodes: Array<VirtualChildNode>): void;
  /**
   * Inserts nodes or texts before the child in this node
   * 
   * Throws a "Error" DOMException if the constraints of the node tree are violated.
   */
  insertBefore(child: VirtualChildNode, ...nodes: Array<VirtualChildNode & VirtualNode>): void;
  /**
   * Inserts nodes or texts after the child in this node
   * 
   * Throws a "Error" DOMException if the constraints of the node tree are violated.
   */
  insertAfter(child: VirtualChildNode, ...nodes: Array<VirtualChildNode & VirtualNode>): void;
  /**
   * Inserts nodes or texts before the first child of this node
   */
  prependChild(...nodes: Array<VirtualChildNode>): void;
  /**
   * Remove a direct child of this node
   */
  removeChild<T extends VirtualChildNode>(child: T): T;
  /**
   * Remove all direct children of this node
   * @returns it's direct children
   */
  removeAllChildren(): Array<VirtualChildNode & VirtualNode>
  /**
   * Replace a direct child of this node with another
   */
  replaceChild<T extends VirtualChildNode>(child: T, ...nodes: Array<(VirtualChildNode & VirtualNode) | string>): T;
  /**
   * Return true if this node or any of it's children contain the requested node
   */
  contains(other: VirtualNode): boolean;
  
  isParentNode(): this is VirtualParentNode;
}
//#endregion

//#region text
function VirtualTextNode<T extends Constructor>(clazz: T = PlaceholderClass as any) {
  return class extends clazz implements VirtualTextNode {

    #data: ReadonlyArray<Readonly<BindableString>> = [{type: 'string', text: ''}];
    public getText(): string {
      return toRawString(this.#data);
    }
    public getTextData(): ReadonlyArray<Readonly<BindableString>> {
      return deepClone(this.#data);
    }

    public setText(text: string | ReadonlyArray<Readonly<BindableString>>): void {
      if (text == null) {
        text = '';
      }
      
      if (Array.isArray(text)) {
        this.#data = text;
      } else {
        this.#data = [{type: 'string', text: String(text)}];
      }
    }

    public isTextNode(): this is VirtualTextNode {
      return true;
    }

    public startTextClone(original: VirtualTextNode, deep?: boolean) {
      this.#data = deepClone(original.getTextData());
    }

    public cloneTo(to: this, deep?: boolean): void {
      to.setText(this.getTextData())
      // @ts-ignore
      super.cloneTo?.(to, deep);
    }
    
  }
}
export interface VirtualTextNode extends VirtualBaseNode {
  getText(): string;
  getTextData(): ReadonlyArray<Readonly<BindableString>>;
  setText(text: string | BindableString[]): void;
  isTextNode(): this is VirtualTextNode;
}
//#endregion

//#region VNode
export interface NodeParams {
  attribute?: boolean;
  child?: boolean;
  event?: boolean;
  parent?: boolean;
  text?: boolean;
}
export function VNode(params: {attribute: true}): new () => VirtualAttributeNode
export function VNode(params: {child: true}): new () => VirtualChildNode
export function VNode(params: {event: true}): new () => VirtualEventNode
export function VNode(params: {parent: true}): new () => VirtualParentNode
export function VNode(params: {attribute: true, child: true}): new () => VirtualAttributeNode & VirtualChildNode
export function VNode(params: {attribute: true, event: true}): new () => VirtualAttributeNode & VirtualEventNode
export function VNode(params: {attribute: true, parent: true}): new () => VirtualAttributeNode & VirtualParentNode
export function VNode(params: {attribute: true, text: true}): new () => VirtualAttributeNode & VirtualTextNode
export function VNode(params: {child: true, event: true}): new () => VirtualChildNode & VirtualEventNode
export function VNode(params: {child: true, parent: true}): new () => VirtualChildNode & VirtualParentNode
export function VNode(params: {child: true, text: true}): new () => VirtualChildNode & VirtualTextNode
export function VNode(params: {event: true, parent: true}): new () => VirtualEventNode & VirtualParentNode
export function VNode(params: {event: true, text: true}): new () => VirtualEventNode & VirtualTextNode
export function VNode(params: {attribute: true, child: true, event: true}): new () => VirtualAttributeNode & VirtualChildNode & VirtualEventNode
export function VNode(params: {attribute: true, child: true, parent: true}): new () => VirtualAttributeNode & VirtualChildNode & VirtualParentNode
export function VNode(params: {attribute: true, child: true, text: true}): new () => VirtualAttributeNode & VirtualChildNode & VirtualTextNode
export function VNode(params: {attribute: true, event: true, parent: true}): new () => VirtualAttributeNode & VirtualEventNode & VirtualParentNode
export function VNode(params: {attribute: true, event: true, text: true}): new () => VirtualAttributeNode & VirtualEventNode & VirtualTextNode
export function VNode(params: {attribute: true, parent: true, text: true}): new () => VirtualAttributeNode & VirtualParentNode & VirtualTextNode
export function VNode(params: {child: true, event: true, parent: true}): new () => VirtualChildNode & VirtualEventNode & VirtualParentNode
export function VNode(params: {child: true, event: true, text: true}): new () => VirtualChildNode & VirtualEventNode & VirtualTextNode
export function VNode(params: {child: true, parent: true, text: true}): new () => VirtualChildNode & VirtualParentNode & VirtualTextNode
export function VNode(params: {attribute: true, child: true, event: true, parent: true}): new () => VirtualAttributeNode & VirtualChildNode & VirtualEventNode & VirtualParentNode
export function VNode(params: {attribute: true, child: true, event: true, text: true}): new () => VirtualAttributeNode & VirtualChildNode & VirtualEventNode & VirtualTextNode
export function VNode(params: {attribute: true, child: true, parent: true, text: true}): new () => VirtualAttributeNode & VirtualChildNode & VirtualParentNode & VirtualTextNode
export function VNode(params: {attribute: true, event: true, parent: true, text: true}): new () => VirtualAttributeNode & VirtualEventNode & VirtualParentNode & VirtualTextNode
export function VNode(params?: NodeParams): Constructor
export function VNode(params: NodeParams = {}): Constructor {
  let builderClass = PlaceholderClass;
  if (params.child) {
    builderClass = VirtualChildNode(builderClass);
  }
  if (params.event) {
    builderClass = VirtualEventNode(builderClass);
  }
  if (params.parent) {
    builderClass = VirtualParentNode(builderClass);
  }
  if (params.attribute) {
    builderClass = VirtualAttributeNode(builderClass);
  }
  if (params.text) {
    builderClass = VirtualTextNode(builderClass);
  }
  return builderClass;
}
//#endregion

