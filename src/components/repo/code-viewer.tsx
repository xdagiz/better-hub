import { getLanguageFromFilename } from "@/lib/github-utils";
import { highlightCode } from "@/lib/shiki";
import { cn } from "@/lib/utils";

export async function CodeViewer({
  content,
  filename,
  className,
}: {
  content: string;
  filename: string;
  className?: string;
}) {
  const lang = getLanguageFromFilename(filename);
  const html = await highlightCode(content, lang);

  const lineCount = content.split("\n").length;
  const gutterW = String(lineCount).length;

  return (
    <div
      className={cn(
        "code-viewer overflow-x-auto rounded-md border border-border",
        className
      )}
      style={{ "--cv-gutter-w": `${gutterW + 1}ch` } as React.CSSProperties}
    >
      <div
        className="code-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
