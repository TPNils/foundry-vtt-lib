import { ElementData, AnyNodeData, AttributeData, BindableString, BindExpressionValue } from "../../types/html-data.js";
import { ParsedToken, CustomPatternMatcherFunc, regexGroup, Lexer, tokenize } from "../lexer.js";
import { VirtualCommentNode } from "./virtual-comment-node.js";
import { VirtualFragmentNode } from "./virtual-fragment-node.js";
import { VirtualHtmlNode } from "./virtual-html-node.js";
import { VirtualChildNode, VirtualNode, VirtualParentNode } from "./virtual-node.js";
import { VirtualTextNode } from "./virtual-text-node.js";

function getExpectedEndBind(previousTokens: ParsedToken[]): string | null {
  let lastOpen: ParsedToken;
  for (let i = previousTokens.length - 1; i >= 0; i--) {
    if (previousTokens[i].lexerToken.name === 'startBinding') {
      lastOpen = previousTokens[i];
      break;
    }
  }
  if (!lastOpen) {
    return null;
  }

  return '}'.repeat(lastOpen.result.length);
}

function endBindingPattern(text: string, offset: number, previousTokens: ParsedToken[]): ReturnType<CustomPatternMatcherFunc> {
  const expected = getExpectedEndBind(previousTokens);
  if (!expected) {
    return null;
  }
  if (text.substring(offset, offset + expected.length) === expected) {
    return {result: expected, consumed: expected};
  }
  return null;
}

function jsNoQuotesPattern(text: string, offset: number, previousTokens: ParsedToken[]): ReturnType<CustomPatternMatcherFunc> {
  const expected = getExpectedEndBind(previousTokens);
  if (!expected) {
    return null;
  }
  return regexGroup(new RegExp(/[^'"`]+?(?=(}}}|"|'|`))/.source.replace('}}}', expected), 's'), 0)(text, offset);
}

const bindableStringLexer: Lexer = {
  defaultMode: 'freeText',
  tokens: {
    freeText: {pattern: /[^{].*?(?={{)/s},
    remainingText: {pattern: {regex: /(.+)/s, group: 1}},
    startBinding: {pattern: /{{{?/, push_mode: 'bound'},
    endBinding: {pattern: endBindingPattern, pop_mode: true},

    jsNoQuotes: {pattern: jsNoQuotesPattern},
    jsSingleQuote: {pattern: /(?<!\\)(?:\\\\)*(?:''|'(.*?[^\\](?:\\\\)*)')/s},
    jsDoubleQuote: {pattern: /(?<!\\)(?:\\\\)*(?:""|"(.*?[^\\](?:\\\\)*)")/s},

    jsStartBacktickQuote: {pattern: /(?<!\\)(?:\\\\)*`/, push_mode: 'backtick'},
    jsBacktickValue: {pattern: /[^`].*?(?=((?<!\\)(?:\\\\)*(?:`))|((?<!\\)(?:\\\\)*(?:\$)((?<!\\)(?:\\\\)*{)))/s},
    jsEndBacktickQuote: {pattern: /(?<!\\)(?:\\\\)*`/, pop_mode: true},
    jsStartInterpolation: {pattern: /(?<!\\)(?:\\\\)*\$(?<!\\)(?:\\\\)*{/, push_mode: 'interpolation'},
    jsEndInterpolation: {pattern: /(?<!\\)(?:\\\\)*}/, pop_mode: true},
  },
  modes: {
    // Order matters, the first in the array will get matched first
    freeText: [
      'freeText',
      'startBinding',
      'remainingText',
    ],
    bound: [
      'endBinding',
      'jsSingleQuote',
      'jsDoubleQuote',
      'jsNoQuotes',
      'jsStartBacktickQuote',
    ],
    interpolation: [
      'jsEndInterpolation',
      'jsSingleQuote',
      'jsDoubleQuote',
      'jsNoQuotes',
    ],
    backtick: [
      'jsStartInterpolation',
      'jsEndBacktickQuote',
      'jsBacktickValue',
    ],
  }
};

export class VirtualNodeParser {

  private constructor() {
  }

  public static htmlToAnyNodeData(html: string): AnyNodeData[] {
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    const rootNode: ElementData = {
      type: 'element',
      tag: '#root#',
      attributes: {},
      children: []
    };
    let pending: Array<{parent: ElementData, toParse: Node}> = [];
    for (const node of Array.from(body.childNodes)) {
      pending.push({parent: rootNode, toParse: node});
    }

    let i = 0;
    while (pending.length > 0) {
      i++;
      if (i >= 1000) {
        throw new Error(`Infinite loop while parsing html: ${html}`)
      }
      const processing = pending;
      pending = [];
      for (const process of processing) {
        if (process.toParse instanceof Text) {
          process.parent.children.push({type: 'text', text: VirtualNodeParser.#parseBindableString(process.toParse.textContent)});
        } else if (process.toParse instanceof Comment) {
          process.parent.children.push({type: 'comment', text: VirtualNodeParser.#parseBindableString(process.toParse.textContent)});
        } else if (process.toParse instanceof Attr) {
          const attr = VirtualNodeParser.#parseAttribute(process.toParse);
          process.parent.attributes[attr.name] = attr;
        } else if (process.toParse instanceof Element) {
          const element: ElementData = {
            type: 'element',
            tag: process.toParse.localName,
            attributes: {},
            children: [],
          }

          for (const attr of Array.from(process.toParse.attributes)) {
            pending.push({parent: element, toParse: attr});
          }

          for (const node of Array.from(process.toParse.childNodes)) {
            pending.push({parent: element, toParse: node});
          }
          process.parent.children.push(element);
        }
        // TODO https://developer.mozilla.org/en-US/docs/Web/API/CDATASection
        // TODO https://developer.mozilla.org/en-US/docs/Web/API/ProcessingInstruction
      }
    }

    return rootNode.children;
  }

  static #parseBindableString(text: string): BindableString[] {
    const lexingResult = tokenize(bindableStringLexer, text)
    
    const response: BindableString[] = []
    let bindMethod : BindExpressionValue['bindMethod'] = 'escaped';
    for (const token of lexingResult) {
      if (token.lexerToken.name === 'startBinding' || token.lexerToken.name === 'endBinding') {
        bindMethod = token.result.length === 2 ? 'escaped' : 'raw';
        if (token.lexerToken.name === 'startBinding') {
          response.push({type: 'bind', text: '', bindMethod});
        }
        continue;
      }
      if (bindableStringLexer.modes.freeText.includes(token.lexerToken.name)) {
        if (response[response.length - 1]?.type !== 'string') {
          response.push({type: 'string', text: ''});
        }
        response[response.length - 1].text += token.result;
        continue;
      }
      if (bindableStringLexer.modes.bound.includes(token.lexerToken.name) || bindableStringLexer.modes.backtick.includes(token.lexerToken.name) || bindableStringLexer.modes.interpolation.includes(token.lexerToken.name)) {
        if (response[response.length - 1]?.type !== 'bind') {
          response.push({type: 'bind', text: '', bindMethod});
        }
        response[response.length - 1].text += token.result;
        continue;
      }
      throw new Error('Internal compile error: missing how to parse token: ' + token.lexerToken.name)
    };

    return response;
  }

  static #parseAttribute(attr: Attr): AttributeData {
    const data: AttributeData = {
      name: attr.name,
      quoteType: `"`,
      value: [],
    }

    if (/^(\[.*\])|(\(.*\))|(\[\(.*\)\])$/.test(data.name)) {
      // Bindable attribute name => take the text as-is
      data.value = [{type: 'string', text: attr.value}];
    } else {
      // Standard attribute name => parse test as bindable
      data.value = VirtualNodeParser.#parseBindableString(attr.value);
    }

    return data;
  }

  public static parse(html: String | AnyNodeData[]): VirtualNode & VirtualParentNode {
    if (typeof html === 'string') {
      // fallback, need to support for raw html parsing
      // supports less features, but thats fine for the current usecase
      html = VirtualNodeParser.htmlToAnyNodeData(html);
    }
    return VirtualNodeParser.parseNodes(html as AnyNodeData[]);
  }
  
  public static parseRaw(html: String | AnyNodeData[]): Array<VirtualChildNode & VirtualNode> {
    const root: Array<VirtualChildNode & VirtualNode> = [];

    for (const node of VirtualNodeParser.parse(html).childNodes) {
      root.push(node);
    }
    for (const node of root) {
      node.remove();
    }

    return root;
  }

  private static parseNodes(nodes: AnyNodeData[]): VirtualNode & VirtualParentNode {
    const rootNode = new VirtualFragmentNode();

    let pending: Array<{nodeData: AnyNodeData, parentVirtualNode: VirtualParentNode}> = [];
    for (const node of nodes) {
      pending.push({nodeData: node, parentVirtualNode: rootNode});
    }

    while (pending.length) {
      const processing = pending;
      pending = [];
      for (const item of processing) {
        switch (item.nodeData.type) {
          case "element": {
            const virtual = new VirtualHtmlNode(item.nodeData.tag);
            for (const attrName in item.nodeData.attributes) {
              const attr = item.nodeData.attributes[attrName];
              if (attr.value.length) {
                // TODO allow bindable text
                virtual.setAttribute(attr.name, VirtualNodeParser.toRawString(attr.value));
              } else {
                virtual.setAttribute(attr.name);
              }
            }
            for (const child of item.nodeData.children) {
              pending.push({nodeData: child, parentVirtualNode: virtual});
            }
            item.parentVirtualNode.appendChild(virtual);
            break;
          }
          case "comment": {
            const virtual = new VirtualCommentNode(item.nodeData.text);
            item.parentVirtualNode.appendChild(virtual);
            break;
          }
          case "text": {
            const virtual = new VirtualTextNode(item.nodeData.text);
            if (virtual.getText().trim().length > 0) {
              item.parentVirtualNode.appendChild(virtual);
            }
            break;
          }
        }
      }
    }

    return rootNode;
  }

  private static toRawString(strings: BindableString[]): string {
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

}