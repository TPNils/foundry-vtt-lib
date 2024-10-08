import { utilsLog } from "../../module-scope.js";
import { AttributeParser } from "../attribute-parser.js";
import { Component } from "../component.js";
import { rerenderQueue } from "./render-queue.js";
import { VirtualFragmentNode } from "./virtual-fragment-node.js";
import { StoredEventCallback, VirtualAttributeNode, VirtualChildNode, VirtualEventNode, VirtualNode, VirtualParentNode } from "./virtual-node.js";
import { VirtualTextNode } from "./virtual-text-node.js";

const domEscapeCharactersByCode = new Map<string, string>();
interface DomAttributeDescribe {
  tag: string;
  attribute: string;
  type: 'string' | 'boolean' | 'number' | 'function' | 'unknown';
}
interface DomNodeDescribe {
  tag: string;
  attributes: Map<string, DomAttributeDescribe>;
}
class DomAttributeDescribes {
  #describesByKey = new Map<string, DomNodeDescribe>();

  public getType(node: Element, attribute: string): string {
    if (!this.#describesByKey.has(node.tagName)) {
      const keys = new Set<string>();
      const readonlyKeys = new Set<string>();
      let loopingKeys = node;
      while (loopingKeys != null) {
        for (const key of Object.keys(loopingKeys)) {
          keys.add(key);
          const descriptor = Object.getOwnPropertyDescriptor(loopingKeys, key);
          if (descriptor) {
            if (descriptor.writable === false) {
              readonlyKeys.add(key);
            } else if (descriptor.get && !descriptor.set) {
              readonlyKeys.add(key);
            }
          }
        }
        loopingKeys = Object.getPrototypeOf(loopingKeys);
      }

      const nodeDescribe: DomNodeDescribe = {
        tag: node.tagName,
        attributes: new Map(),
      }
      this.#describesByKey.set(nodeDescribe.tag, nodeDescribe);

      const elem = document.createElement(nodeDescribe.tag);
      for (const key of keys) {
        const attrDescribe: DomAttributeDescribe = {
          tag: nodeDescribe.tag,
          attribute: key.toLowerCase(),
          type: 'unknown',
        }
        nodeDescribe.attributes.set(attrDescribe.attribute, attrDescribe);

        if (node[key] == null) {
          if (key.startsWith('on')) {
            attrDescribe.type = 'function';
          } else if (!readonlyKeys.has(key)) {
            // Check if we can write that data type
            try {
              if (attrDescribe.type === 'unknown') {
                elem[key] = 1;
                if (elem[key] === 1) {
                  attrDescribe.type = 'number';
                }
              }
            } catch {/*ignore*/}
            try {
              if (attrDescribe.type === 'unknown') {
                elem[key] = 'a';
                if (elem[key] === 'a') {
                  attrDescribe.type = 'string';
                }
              }
            } catch {/*ignore*/}
          }
        } else {
          switch (typeof node[key]) {
            case 'bigint': {
              attrDescribe.type = 'number';
              break;
            }
            case 'boolean':
            case 'function':
            case 'number':
            case 'string': {
              attrDescribe.type = typeof node[key] as DomAttributeDescribe['type'];
              break;
            }
          }
        }
      }
    }

    return this.#describesByKey.get(node.tagName).attributes.get(attribute.toLowerCase())?.type;
  }

  public getValue(node: Element, attribute: string): any {
    const type = this.getType(node, attribute);
    if (type == null) {
      return node.getAttribute(attribute);
    } else {
      return node[attribute];
    }
  }
}
const domAttributeDescribes = new DomAttributeDescribes();
type DomAction = {

} & ({
  type: 'setAttribute';
  node: Element;
  attrName: string;
  preventInput: boolean;
  value: any;
} | {
  type: 'removeAttribute';
  node: Element;
  preventInput: boolean;
  attrName: string;
} | {
  type: 'addEventListener';
  node: Node;
  listener: StoredEventCallback;
} | {
  type: 'removeEventListener';
  node: Node;
  listener: StoredEventCallback;
} | {
  type: 'nodeValue';
  node: Node;
  value: string;
} | {
  type: 'removeNode';
  node: Node;
} | {
  type: 'addNodeToEnd';
  node: Node;
  parent: Node;
} | {
  type: 'addNodeBefore';
  node: Node;
  parent: Node;
  addBefore: Node;
})

const domParser = new DOMParser();
const stateSymbol = Symbol('domCache');
export interface RenderState<T extends VirtualNode = VirtualNode> {
  domNode: ReturnType<T['createDom']>;
  lastRenderSelfState?: T;
  lastRenderChildrenState: Array<VirtualChildNode & VirtualNode>;
}
export class VirtualNodeRenderer {
  
  public static getState<T extends VirtualNode>(virtualNode: T): RenderState<T> | undefined {
    return virtualNode[stateSymbol];
  }
  
  public static setState<T extends VirtualNode>(virtualNode: T, domNode: RenderState<T>): void {
    virtualNode[stateSymbol] = domNode;
  }
  
  /**
   * @param virtualNode The virtual node that needs to be converted to a DOM element
   * @param options.deepUpdate when false and the node already exists, only update the node itself, not it's children
   * @returns Created or updated DOM element
   */
  public static renderDom<T extends VirtualNode>(virtualNode: T, options: {deepUpdate?: boolean, sync: true}): Node[]
  public static renderDom<T extends VirtualNode>(virtualNode: T, options?: {deepUpdate?: boolean, sync?: false}): Promise<Node[]>
  public static renderDom<T extends VirtualNode>(virtualNode: T, options: {deepUpdate?: boolean, sync?: boolean} = {}): Promise<Node[]> | Node[] {
    options = {deepUpdate: false, sync: false, ...options};
    let pending: Array<{parent?: VirtualParentNode, node: VirtualNode, defaultNamespace: string | undefined;}> = [{
      node: virtualNode,
      defaultNamespace: document?.head?.namespaceURI,
    }];
    const allSyncDomActions: DomAction[] = [];
    let allAsyncDomActions: DomAction[] = [];
    
    while (pending.length > 0) {
      const processing = pending;
      pending = [];
      for (const process of processing) {
        if (process.node instanceof VirtualFragmentNode) {
          for (const child of process.node.childNodes) {
            pending.push({parent: process.parent, node: child, defaultNamespace: process.defaultNamespace});
          }
        }
        const state = VirtualNodeRenderer.getOrNewState(process.node, process.defaultNamespace);
        const namespace = state.domNode instanceof Element ? state.domNode.namespaceURI : process.defaultNamespace
        if (state.lastRenderSelfState == null) {
          // First time render
          if (process.node.isAttributeNode()) {
            for (const attr of process.node.getAttributeNames()) {
              allSyncDomActions.push({
                type: 'setAttribute',
                node: (state.domNode as Element),
                attrName: attr.replace(/^attr\./, ''),
                preventInput: /^attr\./.test(attr),
                value: process.node.getAttribute(attr)
              });
            }
          }
    
          if (process.node.isEventNode()) {
            document.addEventListener
            for (const listener of process.node.getEventListeners()) {
              allSyncDomActions.push({
                type: 'addEventListener',
                node: state.domNode,
                listener: listener,
              });
            }
          }
    
          if (process.node.isTextNode()) {
            allSyncDomActions.push({
              type: 'nodeValue',
              node: state.domNode,
              value: process.node.getText(),
            });
          }
          
          if (process.node.isParentNode()) {
            for (const child of process.node.childNodes) {
              state.lastRenderChildrenState.push(child);
              state.domNode.appendChild(VirtualNodeRenderer.getOrNewState(child, namespace).domNode);
              pending.push({parent: process.node, node: child, defaultNamespace: namespace});
            }
          }

          state.lastRenderSelfState = process.node.cloneNode(false);
        } else {
          const domActions: DomAction[] = [];
          if (process.node.isAttributeNode()) {
            for (const attr of process.node.getAttributeNames()) {
              const value = process.node.getAttribute(attr);
              if ((state.lastRenderSelfState as VirtualAttributeNode & VirtualNode).getAttribute(attr) !== value) {
                domActions.push({
                  type: 'setAttribute',
                  node: (state.domNode as Element),
                  attrName: attr.replace(/^attr\./, ''),
                  preventInput: /^attr\./.test(attr),
                  value: value
                });
              }
            }
            
            for (const attr of (state.lastRenderSelfState as VirtualAttributeNode & VirtualNode).getAttributeNames()) {
              if (!process.node.hasAttribute(attr)) {
                domActions.push({
                  type: 'removeAttribute',
                  node: (state.domNode as Element),
                  attrName: attr.replace(/^attr\./, ''),
                  preventInput: /^attr\./.test(attr),
                });
              }
            }
          }

          if (process.node.isEventNode()) {
            const oldListeners = new Map<number, StoredEventCallback>();
            for (const listener of (state.lastRenderSelfState as VirtualEventNode & VirtualNode).getEventListeners()) {
              oldListeners.set(listener.guid, listener);
            }
            
            for (const listener of process.node.getEventListeners()) {
              if (oldListeners.has(listener.guid)) {
                oldListeners.delete(listener.guid);
              } else {
                domActions.push({
                  type: 'addEventListener',
                  node: state.domNode,
                  listener: listener,
                });
              }
            }

            for (const listener of oldListeners.values()) {
              domActions.push({
                type: 'removeEventListener',
                node: state.domNode,
                listener: listener,
              });
            }
          }
          
          if (process.node.isTextNode()) {
            if (process.node.getText() !== (state.lastRenderSelfState as VirtualTextNode & VirtualNode).getText()) {
              domActions.push({
                type: 'nodeValue',
                node: state.domNode,
                value: process.node.getText(),
              });
            }
          }
          
          // add/delete children
          if (options.deepUpdate && process.node.isParentNode()) {
            const currentChildrenByNode = new Map<Node, VirtualNode>();
            for (const child of process.node.childNodes) {
              currentChildrenByNode.set(VirtualNodeRenderer.getOrNewState(child, namespace).domNode, child);
            }

            const previousChildNodes: Node[] = [];
            for (const child of state.lastRenderChildrenState) {
              const childDomNode = VirtualNodeRenderer.getOrNewState(child, namespace).domNode;
              previousChildNodes.push(childDomNode);
              if (!currentChildrenByNode.has(childDomNode)) {
                domActions.push({
                  type: 'removeNode',
                  node: childDomNode,
                })
              }
            }
            for (let i = process.node.childNodes.length - 1; i >= 0; i--) {
              const childDomNode = VirtualNodeRenderer.getOrNewState(process.node.childNodes[i], namespace).domNode;
              if (!previousChildNodes.includes(childDomNode)) {
                if (i === process.node.childNodes.length - 1) {
                  domActions.push({
                    type: 'addNodeToEnd',
                    node: childDomNode,
                    parent: state.domNode
                  });
                } else {
                  domActions.push({
                    type: 'addNodeBefore',
                    node: childDomNode,
                    parent: state.domNode,
                    addBefore: VirtualNodeRenderer.getState(process.node.childNodes[i+1]).domNode,
                  });
                }
              }
            }

            state.lastRenderChildrenState = [];
            for (const child of process.node.childNodes) {
              state.lastRenderChildrenState.push(child);
            }
          }

          if (domActions.length > 0) {
            state.lastRenderSelfState = process.node.cloneNode(false);
          }
          
          // add children to the process queue
          if (options.deepUpdate && process.node.isParentNode()) {
            for (const child of process.node.childNodes) {
              pending.push({parent: process.node, node: child, defaultNamespace: namespace});
            }
          }

          allAsyncDomActions.push(...domActions);
        }
      }
    }
    if (options.sync) {
      allSyncDomActions.push(...allAsyncDomActions);
      allAsyncDomActions = [];
    }
    if (allSyncDomActions.length > 0) {
      VirtualNodeRenderer.processDomActions(allSyncDomActions);
    }
    if (allAsyncDomActions.length > 0) {
      VirtualNodeRenderer.queuedDomActions.push(...allAsyncDomActions);
      return rerenderQueue.add(VirtualNodeRenderer.processDomActionQueue).then(() => {
        return VirtualNodeRenderer.getNodes(virtualNode);
      });
    }
    if (options.sync) {
      return VirtualNodeRenderer.getNodes(virtualNode);
    } else {
      return Promise.resolve(VirtualNodeRenderer.getNodes(virtualNode));
    }
  }

  private static queuedDomActions: DomAction[] = [];
  private static processDomActionQueue = () => {
    const queuedDomActions = VirtualNodeRenderer.queuedDomActions;
    VirtualNodeRenderer.queuedDomActions = [];

    VirtualNodeRenderer.processDomActions(queuedDomActions);
  }
  
  private static processDomActions(domActions: DomAction[]) {
    // Resolve sequential actions on the same property
    const actionMap = new Map<any, any>();
    let actionPathMap: Map<any, any>;
    let actionKey: any[];
    for (const action of domActions) {
      // Actions are listed from earliest to latest added
      switch (action.type) {
        case 'addEventListener':
        case 'removeEventListener': {
          actionKey = [action.node, 'event', action.type, action.listener];
          break;
        }
        case 'setAttribute': 
        case 'removeAttribute': {
          actionKey = [action.node, 'attribute', action.attrName];
          break;
        }
        case 'addNodeBefore':
        case 'addNodeToEnd':
        case 'removeNode': {
          actionKey = [action.node, 'dml'];
        }
        default: {
          actionKey = [action.node, action.type];
        }
      }

      actionPathMap = actionMap;
      for (let i = 0; i < actionKey.length - 1; i++) {
        if (!actionPathMap.has(actionKey[i])) {
          actionPathMap.set(actionKey[i], new Map());
        }
        actionPathMap = actionPathMap.get(actionKey[i]);
      }
      actionPathMap.set(actionKey[actionKey.length - 1], action);
    }

    let pending: Array<Map<any, any>> = [actionMap];
    while (pending.length > 0) {
      const processing = pending;
      pending = [];
      for (const process of processing) {
        for (const item of process.values() as IterableIterator<Map<any, any> | DomAction>) {
          if (item instanceof Map) {
            pending.push(item);
          } else {
            switch (item.type) {
              case 'addEventListener': {
                item.node.addEventListener(item.listener.type, item.listener.callback, item.listener.options);
                break;
              }
              case 'removeEventListener': {
                item.node.removeEventListener(item.listener.type, item.listener.callback, item.listener.options);
                break;
              }
              case 'setAttribute': {
                // Some attributes need to be updated with javascript
                // https://developer.mozilla.org/en-US/docs/Glossary/IDL
                if (domAttributeDescribes.getType(item.node, item.attrName) === 'boolean') {
                  item.node[item.attrName] = AttributeParser.parseBoolean(item.value);
                }
                if (!item.preventInput && Component.isComponentElement(item.node)) {
                  item.node.setInput(item.attrName, item.value);
                } else {
                  const attrNs = AttributeParser.attrToNs(item.attrName);
                  if (item.value === false) {
                    // disabled="false" is still disabled => don't set false attributes
                    if (attrNs.namespace) {
                      item.node.removeAttributeNS(attrNs.namespace, attrNs.name);
                    } else {
                      item.node.removeAttribute(attrNs.name);
                    }
                  } else {
                    if (attrNs.namespace) {
                      item.node.setAttributeNS(attrNs.namespace, attrNs.name, AttributeParser.serialize(item.value));
                    } else {
                      item.node.setAttribute(attrNs.name, AttributeParser.serialize(item.value));
                    }
                  }
                }
                break;
              }
              case 'removeAttribute': {
                item.node.removeAttribute(item.attrName);
                break;
              }
              case 'nodeValue': {
                // domParser.parseFromString removes the start whitespaces
                const whitespacePrefix = /^ */.exec(item.value);
                const unescapedHtml = item.value.replace(/&(#[0-9]+|[a-z]+);/ig, (fullMatch, group1: string) => {
                  if (group1.startsWith('#')) {
                    return String.fromCharCode(Number.parseInt(group1.substring(1)));
                  }

                  if (!domEscapeCharactersByCode.has(group1)) {
                    domEscapeCharactersByCode.set(group1, domParser.parseFromString(fullMatch, 'text/html').documentElement.textContent);
                  }
                  return domEscapeCharactersByCode.get(group1);
                });
                item.node.nodeValue = whitespacePrefix + unescapedHtml;
                break;
              }
              case 'removeNode': {
                if (item.node.parentNode) {
                  item.node.parentNode.removeChild(item.node)
                }
                break;
              }
              case 'addNodeBefore': {
                try {
                  if (item.addBefore instanceof Element) {
                    item.addBefore.parentNode.insertBefore(item.node, item.addBefore);
                  } else {
                    item.parent.insertBefore(item.node, item.addBefore);
                  }
                } catch (e) {
                  utilsLog().error(item, e);
                }
                break;
              }
              case 'addNodeToEnd': {
                item.parent.appendChild(item.node);
                break;
              }
            }
          }
        }
      }
    }
  }

  private static getOrNewState<T extends VirtualNode>(virtualNode: T, defaultNamespace?: string): RenderState<T> {
    let state = VirtualNodeRenderer.getState(virtualNode);
    if (!state) {
      state = {
        domNode: virtualNode.createDom(defaultNamespace) as ReturnType<T['createDom']>,
        lastRenderChildrenState: [],
      };
      VirtualNodeRenderer.setState(virtualNode, state);
    }
    return state;
  }

  private static getNodes<T extends VirtualNode>(virtualNode: T): Node[] {
    if (virtualNode instanceof VirtualFragmentNode) {
      let pendingNodes: VirtualNode[] = [virtualNode];
      const resultRootNodes: VirtualNode[] = [];
      while (pendingNodes.length > 0) {
        const processingNodes = pendingNodes;
        pendingNodes = [];
        for (const node of processingNodes) {
          if (node instanceof VirtualFragmentNode) {
            pendingNodes.push(...Array.from(node.childNodes));
          } else {
            resultRootNodes.push(node);
          }
        }
      }

      return resultRootNodes.map(node => VirtualNodeRenderer.getState(node).domNode);
    } else {
      return [VirtualNodeRenderer.getState(virtualNode).domNode];
    }
  }

}