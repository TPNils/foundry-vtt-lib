
import { createParser, render } from 'css-selector-parser/dist/mjs';
import { utilsLog } from '../module-scope';
import { AstRule, AstSelector, AstPseudoClass, AstEntity, AstAttribute, AstString } from 'css-selector-parser';

const cssParser = createParser({
  syntax: {
    baseSyntax: 'selectors-4',
    pseudoClasses: {
      unknown: 'accept',
      definitions: {
        NoArgument: [
          'deep',
          'host', 'host-context',
        ],
        String: [
          'dir', 'lang',
        ],
        Selector: [
          'host-context',
          'is', 'not', 'where', 'has',
        ],
        Formula: [
          'nth-child', 'nth-last-child', 'first-child', 'last-child', 'nth-of-type', 'nth-last-of-type'
        ]
      }
    },
    combinators: ['>', '+', '~'],
    attributes: {
      operators: ['^=', '$=', '*=', '~=']
    }
  },
  substitutes: true
});

export const cssHostIdAttr = `nlib-hid`;
export const cssComponentIdAttr = `nlib-cid`;

export function scopeCssSelector(selector: string, htmlTag: string): string {
  try {
    const astSelector = cssParser(selector);

    astSelector.rules = astSelector.rules.map(inputRule => {
      let rules: Array<AstRule> = [inputRule];
      while (rules[rules.length - 1].nestedRule) {
        rules.push(rules[rules.length - 1].nestedRule!);
      }

      // Inject :host if the first attr is :deep
      const firstRuleItem = rules[0].items?.[0];
      if (firstRuleItem?.type === 'PseudoClass' && firstRuleItem.name === 'deep') {
        rules.unshift({type: 'Rule', items: [{type: 'PseudoClass', name: 'host'}]});
      }

      // replace :host selector
      for (const rule of rules) {
        const items = rule.items == null ? [] : rule.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type !== 'PseudoClass' || item.name !== 'host') {
            continue;
          }
          items[i] = {
            type: 'Attribute',
            name: cssHostIdAttr,
            operator: '=',
            value: {
              type: 'String',
              value: htmlTag,
            }
          };
        }
      }

      // Inject item attributes
      rules: for (const rule of rules) {
        let shouldAddItemAttr = true;
        for (const item of rule.items ?? []) {
          if (isScoped(item, htmlTag)) {
            shouldAddItemAttr = false;
            break;
          }
        }
        for (const item of rule.items ?? []) {
          if (item.type === 'PseudoClass') {
            if (item.name === 'host-context') {
              shouldAddItemAttr = false;
              break;
            }
            if (item.name === 'deep') {
              // :deep selector only exists virtually => remove it
              rule.items = rule.items.filter(filteredItem => filteredItem.type !== 'PseudoClass' || filteredItem.name !== 'deep');
              // Break => don't add any more attributes to this or the next rules
              break rules;
            }
          }
        }
        if (shouldAddItemAttr) {
          rule.items ?? [];
          rule.items.unshift({
            type: 'Attribute',
            name: cssComponentIdAttr,
            operator: '=',
            value: {
              type: 'String',
              value: htmlTag,
            }
          })
        }
      }
      
      // TODO replace :host-context() selector
      {
        let adjustedRules: typeof rules = [];
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];
          const hostContextPseudo = rule.items?.find(i => i.type === 'PseudoClass' && i.argument?.type === 'Selector' && i.name === 'host-context') as AstPseudoClass & {argument: AstSelector};
          if (!hostContextPseudo) {
            adjustedRules.push(rule); // Don't change
            continue;
          }
          
          if (rule.items.length > 1) {
            throw new Error(`:host-context() can't be combined with other css rules. Found: ${render(rule)}`);
          }

          if (hostContextPseudo.argument.rules.length > 1) {
            throw new Error(`:host-context() currently only supports a single rule. Found: ${render(rule)}`);
          }
          
          const replaceRules: Array<AstRule> = [{
            ...hostContextPseudo.argument.rules[0],
            nestedRule: null,
          }];
          while (replaceRules[replaceRules.length - 1].nestedRule) {
            replaceRules.push({
              ...replaceRules[replaceRules.length - 1].nestedRule,
              nestedRule: null,
            });
          }
          adjustedRules.push(...replaceRules);
          let hasHostSelector = false;
          for (const item of rules[i+1]?.items ?? []) {
            if (isScoped(item, htmlTag)) {
              hasHostSelector = true;
            }
          }
          if (!hasHostSelector) {
            adjustedRules.push({
              type: 'Rule',
              items: [{type: 'Attribute', operator: '=', name: cssHostIdAttr, value: {type: 'String', value: htmlTag}}],
            })
          }
        }
        rules = adjustedRules;
      }

      // Write the order of the rules the way cssParser expects
      for (const r of rules) {
        delete r.nestedRule;
      }
      rules = rules.filter(r => r.items.length > 0);
      for (let i = 0; i < rules.length - 1; i++) {
        rules[i].nestedRule = rules[i+1];
      }
      return rules[0];
    });

    return render(astSelector);
  } catch (e) {
    utilsLog().debug('failed to parse selector', selector, 'for component', htmlTag)
    throw e;
  }
}

function isScoped(entity: AstEntity, htmlTag: string): entity is AstAttribute & {operator: '=', value: AstString;} {
  return entity.type === 'Attribute' && 
    [cssHostIdAttr, cssComponentIdAttr].includes(entity.name) && entity.operator === '=' && 
    entity.value?.type === 'String' && 
    entity.value.value === htmlTag;
}