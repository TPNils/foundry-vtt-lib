import { UtilsHooks } from "../utils/utils-hooks";
import { ComponentElement } from "./component";

const attrName = `data-nils-library-tag-replacer`;
function registerHooks(): void {
  // Foundry strips custom elements in the backend => find replace on client side
  // Note: javascript does not support migrating event listeners. If this is an issue, may want to revisit this.
  UtilsHooks.init().then(() => {
    const observer = new MutationObserver((mutationsList, observer) => {
      for (const mutation of mutationsList) {
        for (const addedNode of Array.from(mutation.addedNodes)) {
          if (addedNode instanceof Element) {
            injectCustomElement(addedNode);
          }
        }
      }
    });

    // the "/stream" url body loads before init in V8 (I would assume also later versions)
    document.body.querySelectorAll(`[${attrName}]`).forEach(elem => {
      injectCustomElement(elem);
    });
    
    // Start observing the target node for configured mutations
    observer.observe(document, { childList: true, subtree: true });
  });
}

function injectCustomElement(addedNode: Element): void {
  const queryNode = addedNode.matches(`[${attrName}]`) ? [addedNode] : Array.from(addedNode.querySelectorAll(`[${attrName}]`));
  for (const node of queryNode) {
    if (node.parentNode == null) {
      // Can't replace top level
      continue;
    }
    const tagReplacer = node.getAttribute(attrName);
    const elementConstructor = customElements.get(tagReplacer);
    let constructorIter = elementConstructor;
    while (constructorIter !== ComponentElement && constructorIter != null) {
      constructorIter = Object.getPrototypeOf(constructorIter);
    }

    // Only support Components
    // Main reason is security like prevent <script> tags
    // Might want to support _all_ custom elements, but we will cross that bridge when we get there.
    if (constructorIter) {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        node.removeChild(child);
      }

      const element = new elementConstructor();
      for (const child of children) {
        element.append(child);
      }

      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        if (attr.name === attrName && attr.namespaceURI == null) {
          continue;
        }
        element.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
      }

      node.parentNode.replaceChild(element, node);
    }
  }
}

registerHooks();