export type MarkdownDiffLine = {
  kind: "context" | "added" | "removed";
  text: string;
  old_line: number | null;
  new_line: number | null;
};

type MarkdownDiffProps = {
  lines: MarkdownDiffLine[];
  title?: string;
};

export function MarkdownDiff({ lines, title = "Markdown 差异预览" }: MarkdownDiffProps) {
  if (!lines.length) {
    return (
      <section className="markdown-diff" aria-label={title}>
        <header>
          <span>{title}</span>
          <strong>无变更</strong>
        </header>
        <p>目标文件与当前草稿一致。</p>
      </section>
    );
  }

  return (
    <section className="markdown-diff" aria-label={title}>
      <header>
        <span>{title}</span>
        <strong>{lines.length} 行</strong>
      </header>
      <ol>
        {lines.map((line, index) => (
          <li className={`markdown-diff-line ${line.kind}`} key={`${line.kind}-${index}`}>
            <code>{line.old_line ?? ""}</code>
            <code>{line.new_line ?? ""}</code>
            <span>{line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}</span>
            <pre>{line.text || " "}</pre>
          </li>
        ))}
      </ol>
    </section>
  );
}

