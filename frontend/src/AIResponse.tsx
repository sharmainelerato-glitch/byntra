
import { Fragment, type ReactNode } from "react";
import "./ai-response.css";

type Props = { content: string };

function clean(text: string): string {
  return text
    .replace(/\\?<br\s*\/?\s*>/gi, "\uE000")
    .replace(/\\([*_`[\]\\])/g, "$1");
}

function inlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(
    /(\*\*[^*\n]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|`[^`]+`|\*[^*\n]+\*)/g
  );

  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={index}>
          {token.slice(2, -2)}
        </strong>
      );
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code key={index}>
          {token.slice(1, -1)}
        </code>
      );
    }

    const link =
      /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);

    if (link) {
      return (
        <a
          key={index}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link[1]}
        </a>
      );
    }

    if (token.startsWith("*") && token.endsWith("*")) {
      return (
        <em key={index}>
          {token.slice(1, -1)}
        </em>
      );
    }

    return (
      <Fragment key={index}>
        {token}
      </Fragment>
    );
  });
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((part) => part.trim());
}

function isTableSeparator(line: string): boolean {
  const parts = tableCells(line);

  return (
    parts.length >= 2 &&
    parts.every((part) => /^:?-{3,}:?$/.test(part))
  );
}

function isList(line: string): boolean {
  return /^(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function isTableStart(
  lines: string[],
  i: number
): boolean {
  return (
    i + 1 < lines.length &&
    lines[i].includes("|") &&
    isTableSeparator(lines[i + 1])
  );
}

function formattedLines(value: string): ReactNode[] {
  return value
    .split(/[\n\uE000]/)
    .map((part, i) => (
      <Fragment key={i}>
        {i > 0 && <br />}
        {inlineMarkdown(part)}
      </Fragment>
    ));
}

export default function AIResponse({
  content
}: Props) {
  const lines = clean(content)
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const blocks: ReactNode[] = [];

  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (
      !line ||
      line.toLowerCase() === "svg"
    ) {
      i++;
      continue;
    }

    // Convert Markdown tables into cards.
    if (isTableStart(lines, i)) {
      const headers = tableCells(lines[i]);

      i += 2;

      const rows: string[][] = [];

      while (
        i < lines.length &&
        lines[i].trim().includes("|") &&
        !isTableSeparator(lines[i])
      ) {
        rows.push(tableCells(lines[i]));
        i++;
      }

      blocks.push(
        <div
          className="byntra-ai-cards"
          key={`table-${i}`}
        >
          {rows.map((row, rowIndex) => (
            <article
              className="byntra-ai-card"
              key={rowIndex}
            >
              <h4>
                {inlineMarkdown(
                  row[0] || `Item ${rowIndex + 1}`
                )}
              </h4>

              {headers.slice(1).map(
                (header, index) =>
                  row[index + 1] ? (
                    <div
                      className="byntra-ai-card-detail"
                      key={index}
                    >
                      <span className="byntra-ai-card-label">
                        {inlineMarkdown(header)}
                      </span>

                      <p>
                        {formattedLines(
                          row[index + 1]
                        )}
                      </p>
                    </div>
                  ) : null
              )}
            </article>
          ))}
        </div>
      );

      continue;
    }

    // Headings.
    const heading =
      /^(#{1,6})\s+(.+)$/.exec(line);

    if (heading) {
      blocks.push(
        heading[1].length <= 2 ? (
          <h3 key={`heading-${i}`}>
            {inlineMarkdown(heading[2])}
          </h3>
        ) : (
          <h4 key={`heading-${i}`}>
            {inlineMarkdown(heading[2])}
          </h4>
        )
      );

      i++;
      continue;
    }

    // Standalone bold headings.
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      blocks.push(
        <h3 key={`heading-${i}`}>
          {inlineMarkdown(line)}
        </h3>
      );

      i++;
      continue;
    }

    // Bullet and numbered lists.
    if (isList(line)) {
      const ordered =
        /^\d+[.)]\s+/.test(line);

      const items: string[] = [];

      while (
        i < lines.length &&
        isList(lines[i].trim())
      ) {
        items.push(
          lines[i]
            .trim()
            .replace(
              /^(?:[-*+]\s+|\d+[.)]\s+)/,
              ""
            )
        );

        i++;
      }

      const children = items.map(
        (item, index) => (
          <li key={index}>
            {formattedLines(item)}
          </li>
        )
      );

      blocks.push(
        ordered ? (
          <ol key={`list-${i}`}>
            {children}
          </ol>
        ) : (
          <ul key={`list-${i}`}>
            {children}
          </ul>
        )
      );

      continue;
    }

    // Normal paragraphs.
    const paragraph: string[] = [line];

    i++;

    while (
      i < lines.length &&
      lines[i].trim() &&
      !isHeading(lines[i].trim()) &&
      !isList(lines[i].trim()) &&
      !isTableStart(lines, i) &&
      !/^\*\*[^*]+\*\*$/.test(
        lines[i].trim()
      )
    ) {
      paragraph.push(
        lines[i].trim()
      );

      i++;
    }

    blocks.push(
      <p key={`paragraph-${i}`}>
        {formattedLines(
          paragraph.join("\n")
        )}
      </p>
    );
  }

  return (
    <div className="byntra-ai-response">
      {blocks}
    </div>
  );
}
