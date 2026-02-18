import { createHighlighter, type Highlighter } from "shiki";
import { parseDiffPatch, getLanguageFromFilename } from "./github-utils";

const THEMES = ["vitesse-light", "vitesse-black"] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...THEMES],
      langs: [],
    });
  }
  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  lang: string
): Promise<string> {
  const highlighter = await getHighlighter();

  // Lazy-load the language if not already loaded
  const loaded = highlighter.getLoadedLanguages();
  const target = lang || "text";
  if (!loaded.includes(target as any)) {
    try {
      await highlighter.loadLanguage(target as any);
    } catch {
      // Fall back to text if language isn't supported
      if (!loaded.includes("text" as any)) {
        await highlighter.loadLanguage("text" as any);
      }
      return highlighter.codeToHtml(code, {
        lang: "text",
        themes: { light: THEMES[0], dark: THEMES[1] },
        defaultColor: false,
      });
    }
  }

  try {
    return highlighter.codeToHtml(code, {
      lang: target,
      themes: { light: THEMES[0], dark: THEMES[1] },
      defaultColor: false,
    });
  } catch {
    return highlighter.codeToHtml(code, {
      lang: "text",
      themes: { light: THEMES[0], dark: THEMES[1] },
      defaultColor: false,
    });
  }
}

export interface SyntaxToken {
  text: string;
  lightColor: string;
  darkColor: string;
}

async function loadLang(lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const loaded = highlighter.getLoadedLanguages();
  if (loaded.includes(lang as any)) return lang;
  try {
    await highlighter.loadLanguage(lang as any);
    return lang;
  } catch {
    if (!loaded.includes("text" as any)) {
      try { await highlighter.loadLanguage("text" as any); } catch {}
    }
    return "text";
  }
}

/**
 * Tokenize an entire file for full-file view syntax highlighting.
 * Returns an array of SyntaxToken[] per line (0-indexed: result[0] = line 1).
 */
export async function highlightFullFile(
  code: string,
  filename: string
): Promise<SyntaxToken[][]> {
  if (!code) return [];

  const lang = getLanguageFromFilename(filename);
  const effectiveLang = await loadLang(lang);
  const highlighter = await getHighlighter();

  const tokenResult = highlighter.codeToTokens(code, {
    lang: effectiveLang as any,
    themes: { light: THEMES[0], dark: THEMES[1] },
  });

  return tokenResult.tokens.map((lineTokens) =>
    lineTokens.map((t: any) => ({
      text: t.content,
      lightColor: t.htmlStyle?.color || "",
      darkColor: t.htmlStyle?.["--shiki-dark"] || "",
    }))
  );
}

export async function highlightDiffLines(
  patch: string,
  filename: string
): Promise<Record<string, SyntaxToken[]>> {
  if (!patch) return {};

  const lang = getLanguageFromFilename(filename);
  const diffLines = parseDiffPatch(patch);
  const effectiveLang = await loadLang(lang);
  const highlighter = await getHighlighter();

  // Build old (remove+context) and new (add+context) code streams
  const oldStream: { key: string; content: string }[] = [];
  const newStream: { key: string; content: string }[] = [];

  for (const line of diffLines) {
    if (line.type === "header") continue;
    if (line.type === "context") {
      oldStream.push({ key: `C-old-${line.oldLineNumber}`, content: line.content });
      newStream.push({ key: `C-${line.newLineNumber}`, content: line.content });
    } else if (line.type === "remove" && line.oldLineNumber !== undefined) {
      oldStream.push({ key: `R-${line.oldLineNumber}`, content: line.content });
    } else if (line.type === "add" && line.newLineNumber !== undefined) {
      newStream.push({ key: `A-${line.newLineNumber}`, content: line.content });
    }
  }

  const result: Record<string, SyntaxToken[]> = {};

  const tokenizeStream = (stream: { key: string; content: string }[]) => {
    if (stream.length === 0) return;
    const code = stream.map((l) => l.content).join("\n");
    const tokenResult = highlighter.codeToTokens(code, {
      lang: effectiveLang as any,
      themes: { light: THEMES[0], dark: THEMES[1] },
    });
    tokenResult.tokens.forEach((lineTokens, i) => {
      if (i < stream.length) {
        result[stream[i].key] = lineTokens.map((t: any) => ({
          text: t.content,
          lightColor: t.htmlStyle?.color || "",
          darkColor: t.htmlStyle?.["--shiki-dark"] || "",
        }));
      }
    });
  };

  tokenizeStream(oldStream);
  tokenizeStream(newStream);

  return result;
}
