import { CommentData } from "../../types/html-data.js";
import { VirtualAttributeNode, VirtualEventNode, VirtualNode, VirtualParentNode, VNode } from "./virtual-node.js";

export class VirtualCommentNode extends VNode({child: true, text: true}) implements VirtualNode {

  public constructor(nodeValue?: string | CommentData['text']) {
    super();
    this.setText(nodeValue);
  }

  get nodeName(): string {
    return '#comment';
  }

  public cloneNode(deep?: boolean): this {
    const clone = new VirtualCommentNode() as this;
    this.cloneTo(clone, deep);
    return clone;
  }

  public createDom(): Node {
    return document.createComment('');
  }

  public isNode(): this is VirtualNode {
    return true;
  }

  public isAttributeNode(): this is VirtualAttributeNode {
    return false;
  }

  public isEventNode(): this is VirtualEventNode {
    return false;
  }

  public isParentNode(): this is VirtualParentNode {
    return false;
  }

  public toString(): string {
    return `<!--${this.getText()}-->`
  }
  
}