type Writeable<T extends { [x: string]: any }, K extends string = keyof T & string> = {
  [P in K]: T[P];
}


export type CustomPatternMatcherFunc = (
  /**
   * The full input string.
   */
  text: string,
  /**
   * The offset at which to attempt a match
   */
  offset: number,
  /**
   * Previously scanned Tokens
   */
  tokens: ParsedToken[],
) => {consumed: string, result: string} | null;

export interface ParsedToken {
  readonly lexerToken: Readonly<Compiled.LexerToken>;
  readonly result: string
  readonly startOffsetInc: number
  readonly endOffsetExcl: number
}

export type LexerTokenPattern = RegExp | CustomPatternMatcherFunc | {regex: RegExp, group: number};

export type LexerToken = {
  readonly name: string;
  readonly pattern: LexerTokenPattern;
  readonly pop_mode?: boolean;
  readonly push_mode?: string;
}

export interface LexerTokenCollection {
  [name: string]: Omit<LexerToken, 'name'>;
}

export interface Lexer {
  defaultMode: keyof this['modes'];
  tokens: LexerTokenCollection,
  modes: {
    [key: string]: Array<string>;
  }
}

namespace Compiled {

  export interface Lexer {
    defaultMode: keyof this['modes'];
    modes: {
      [key: string]: Array<Compiled.LexerToken>;
    }
  }
  
  export interface LexerToken {
    readonly name: string;
    readonly pattern: CustomPatternMatcherFunc;
    readonly pop_mode?: boolean;
    readonly push_mode?: string;
  }
}

export function regexGroup(regex: RegExp, groupNr: number) {
  if (!regex.sticky) {
    regex = new RegExp(regex.source, (regex.flags ?? '') + 'y')
  }
  return (text: string, offset: number) => {
    regex.lastIndex = offset;

    const regexResult = regex.exec(text);
    if (!regexResult) {
      return null;
    }
    
    return {
      consumed: regexResult[0],
      result: regexResult[groupNr]
    };
  }
}

export function tokenize(rawLexer: Lexer, text: string): ParsedToken[] {
  const lexer = compileLexer(rawLexer);
  const parsedTokens: ParsedToken[] = [];
  let modeStack: Array<typeof lexer['defaultMode']> = [lexer.defaultMode];
  let currentOffset = 0;

  while (currentOffset < text.length) {
    let match: ReturnType<CustomPatternMatcherFunc>;
    let matchedToken: Compiled.LexerToken;
    for (const token of lexer.modes[modeStack[modeStack.length-1]]) {
      match = token.pattern(text, currentOffset, parsedTokens);
      if (match != null) {
        matchedToken = token;
        break;
      }
    }

    if (match == null) {
      throw new Error(`Unable to parse text.\nCurrent mode: ${modeStack[modeStack.length-1]}\nOffset: ${currentOffset}\nTokens:${parsedTokens.map(t => `\n- ${t.lexerToken.name} => '${t.result}'`).join('')}\nText: '${text}'\nMatching: ${text.substring(currentOffset)}`);
    }

    parsedTokens.push({
      lexerToken: matchedToken,
      result: match.result,
      startOffsetInc: currentOffset,
      endOffsetExcl: currentOffset + match.consumed.length,
    });
    if (matchedToken.pop_mode) {
      modeStack.pop();
    }
    if (matchedToken.push_mode) {
      modeStack.push(matchedToken.push_mode);
    }
    currentOffset += match.consumed.length;
  }

  return parsedTokens;
}

function compileLexer(lexer: Lexer): Compiled.Lexer {
  const compiledLexer: Compiled.Lexer = {
    defaultMode: lexer.defaultMode,
    modes: {},
  }

  for (const [mode, tokens] of Object.entries(lexer.modes)) {
    compiledLexer.modes[mode] = tokens.map(t => compileLexerToken({name: t, ...lexer.tokens[t]}));
  }

  return compiledLexer;
}

function compileLexerToken(token: LexerToken): Compiled.LexerToken {
  const compiledToken: Partial<Writeable<Compiled.LexerToken>> = {
    name: token.name
  }

  if ('pop_mode' in token) {
    compiledToken.pop_mode = token.pop_mode;
  }
  if ('push_mode' in token) {
    compiledToken.push_mode = token.push_mode;
  }

  if (token.pattern instanceof RegExp) {
    compiledToken.pattern = regexGroup(token.pattern, 0);
  } else if (isRegexGroup(token.pattern)) {
    compiledToken.pattern = regexGroup(token.pattern.regex, token.pattern.group);
  } else {
    compiledToken.pattern = token.pattern;
  }

  return compiledToken as Compiled.LexerToken;
}

function isRegexGroup(arg: any): arg is {regex: RegExp, group: number} {
  return arg != null && typeof arg === 'object' && arg.regex instanceof RegExp && typeof arg.group === 'number';
}