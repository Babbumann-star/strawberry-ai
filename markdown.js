/* ================= MATH ================= */

  /*
    KaTeX is optional. If the script failed to load, math
    delimiters are stripped and the raw LaTeX is shown as
    text so nothing is lost.
  */

  /*
    KaTeX is loaded with defer, so it is not available
    while this file parses. Availability must be
    checked when rendering, not cached at load time.
  */

  const katexReady = () =>
    typeof window !== "undefined" &&
    typeof window.katex !== "undefined" &&
    typeof window.katex.render === "function";

  const MATH_SYMBOLS =
    /[\\{}^_&]|\\frac|\\sqrt|\\sum|\\int|\\lim|\\alpha|\\beta|\\gamma|\\infty|\\cdot|\\times|\\pm|\\leq|\\geq|\\neq|\\approx|\\begin|\\end|\\text|\\mathbb|\\mathbf|\\left|\\right/;

  const hasMathContent = (s) => MATH_SYMBOLS.test(s);

  function renderMath(target, tex, displayMode) {

    if (!katexReady()) {

      target.textContent = tex;

      return;

    }

    try {

      window.katex.render(tex, target, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
        output: "html"
      });

    } catch (error) {

      target.textContent = tex;

    }

  }

  function makeMathNode(tex, displayMode) {

    const span =
      document.createElement("span");

    span.className = displayMode
      ? "katex-display-host"
      : "katex-inline-host";

    renderMath(span, tex, displayMode);

    return span;

  }

  /*
    Finds the closing delimiter for a math run, skipping
    escaped characters. Returns -1 when unterminated so
    the caller can fall back to literal text.
  */

  function findMathEnd(text, from, closer) {

    for (let i = from; i < text.length; i++) {

      if (text[i] === "\\") {
        i++;
        continue;
      }

      if (
        text.startsWith(closer, i) &&
        (closer !== "$" || text[i + 1] !== "$")
      ) {

        return i;

      }

    }

    return -1;

  }

  /*
    Display math is handled before the block parser runs so
    a formula spanning several lines is never split on \n.
  */

  function splitDisplayMath(text) {

    const parts = [];

    const pattern =
      /\$\$([\s\S]+?)\$\$\s*|\\\[([\s\S]+?)\\\]\s*/g;

    let last = 0;

    let match;

    while (
      (match = pattern.exec(text)) !== null
    ) {

      if (match.index > last) {

        parts.push({
          type: "text",
          value: text.slice(last, match.index)
        });

      }

      parts.push({
        type: "math",
        value: (match[1] ?? match[2] ?? "").trim(),
        display: true
      });

      last = pattern.lastIndex;

    }

    if (last < text.length) {

      parts.push({
        type: "text",
        value: text.slice(last)
      });

    }

    return parts.length
      ? parts
      : [{ type: "text", value: text }];

  }

  /*
    Inline math. Currency amounts such as "$5" and "costs
    $10 and $20" are left alone: an inline run only counts
    when it is closed on the same line and the content looks
    like LaTeX rather than plain prose.
  */

  function tokenizeMathInline(text) {

  const out = [];

  let pending = "";

  let index = 0;

  /*
    Plain segments are tokenized normally so emphasis,
    links and code spans inside them still work, while
    each formula becomes one opaque node that the
    emphasis pass cannot reach into.
  */

  const emitText = () => {

    if (!pending) return;

    const { out: chunk } = tokenizeInline(pending);

    chunk.forEach((entry) => out.push(entry));

    pending = "";

  };

  const pushMath = (tex) => {

    emitText();

    out.push({ node: makeMathNode(tex, false) });

  };

  const isCurrency = (s) => {

    const v = s.trim();

    if (!v) return true;

    return /^[\d.,]+$/.test(v) || /^\d/.test(v);

  };

  while (index < text.length) {

    const ch = text[index];

    /*
      Code spans win over math: `code` stays literal
      even when it contains a dollar sign.
    */

    if (ch === "`") {

      let run = 0;

      while (text[index + run] === "`") run++;

      const fence = "`".repeat(run);

      const close = text.indexOf(fence, index + run);

      if (close !== -1) {

        pending +=
          text.slice(index, close + run);

        index = close + run;

        continue;

      }

      pending += fence;

      index += run;

      continue;

    }

    if (ch === "\\" && text[index + 1] === "(") {

      const close = findMathEnd(text, index + 2, "\\)");

      if (close !== -1) {

        pushMath(text.slice(index + 2, close));

        index = close + 2;

        continue;

      }

    }

    if (ch === "$") {

      const lineEnd = text.indexOf("\n", index);

      const limit =
        lineEnd === -1 ? text.length : lineEnd;

      const close = findMathEnd(text, index + 1, "$");

      if (
        close !== -1 &&
        close <= limit &&
        close > index + 1
      ) {

        const inner = text.slice(index + 1, close);

        if (!isCurrency(inner)) {

          pushMath(inner);

          index = close + 1;

          continue;

        }

      }

    }

    pending += ch;

    index++;

  }

  emitText();

  return out;

}

  /*
    Detects undelimited LaTeX on its own, for example a
    model replying with "\frac{1}{2}" or "\alpha = 5" as
    the entire message. Only applied to short standalone
    runs so ordinary prose is never rewritten.
  */

  function wrapBareLatex(text) {

    const trimmed = text.trim();

    if (trimmed.length > 200) return text;

    if (!trimmed.startsWith("\\")) return text;

    if (
      /\\begin\{(equation|align|matrix|pmatrix|bmatrix|cases|array)/.test(
        trimmed
      )
    ) {

      return "$\n" + trimmed + "\n$";

    }

    if (!hasMathContent(trimmed)) return text;

    if (trimmed.includes("\n\n")) return text;

    return "$" + trimmed + "$";

  }


/* ================= MARKDOWN ================= */

const ESCAPABLE = /[\\`*_[\]()#+\-.!>~|{}]/;

const isSpace = (c) => c === undefined || /\s/.test(c);

const isPunct = (c) =>
  c !== undefined && !/[\w\s]/.test(c);

/*
  Splits a line of text into nodes and unresolved
  emphasis delimiters. Emphasis is resolved
  afterwards so nesting depth and delimiter length
  are decided by the surrounding pairs, not by a
  flat regular expression.
*/

function tokenizeInline(text) {

  const out = [];

  let buffer = "";

  let index = 0;

  const flush = () => {

    if (!buffer) return;

    out.push({
      node: document.createTextNode(buffer)
    });

    buffer = "";

  };

  const addDelim = (ch, run, canOpen, canClose) => {

    flush();

    out.push({
      delim: { ch, run, canOpen, canClose }
    });

  };

  while (index < text.length) {

    const ch = text[index];

    if (
      ch === "\\" &&
      index + 1 < text.length &&
      ESCAPABLE.test(text[index + 1])
    ) {

      buffer += text[index + 1];

      index += 2;

      continue;

    }

    if (ch === "`") {

      let run = 0;

      while (text[index + run] === "`") run++;

      const fence = "`".repeat(run);

      const close =
        text.indexOf(fence, index + run);

      if (close !== -1) {

        flush();

        let inner =
          text.slice(index + run, close);

        if (
          inner.length > 2 &&
          inner.startsWith(" ") &&
          inner.endsWith(" ") &&
          inner.trim()
        ) {

          inner = inner.slice(1, -1);

        }

        const code =
          document.createElement("code");

        code.textContent = inner;

        out.push({ node: code });

        index = close + run;

        continue;

      }

      buffer += fence;

      index += run;

      continue;

    }

    if (ch === "[") {

      const link = text
        .slice(index)
        .match(
          /^\[([^\]\n]*)\]\(\s*<?([^)\s<>]*)>?[^)]*\)/
        );

      if (link) {

        flush();

        const url =
          sanitizeUrl(link[2]);

        if (url) {

          const anchor =
            document.createElement("a");

          anchor.textContent =
            link[1] || link[2];

          anchor.setAttribute(
            "href",
            url
          );

          anchor.setAttribute(
            "rel",
            "noopener noreferrer"
          );

          out.push({ node: anchor });

        } else {

          out.push({
            node: document.createTextNode(
              link[0]
            )
          });

        }

        index += link[0].length;

        continue;

      }

      buffer += ch;

      index++;

      continue;

    }

    if (ch === "*" || ch === "_") {

      let run = 0;

      while (text[index + run] === ch) run++;

      const before =
        index > 0 ? text[index - 1] : undefined;

      const after =
        index + run < text.length
          ? text[index + run]
          : undefined;

      const leftFlanking =
        !isSpace(after) &&
        (!isPunct(after) ||
          isSpace(before) ||
          isPunct(before));

      const rightFlanking =
        !isSpace(before) &&
        (!isPunct(before) ||
          isSpace(after) ||
          isPunct(after));

      let canOpen;
      let canClose;

      if (ch === "*") {

        canOpen = leftFlanking;
        canClose = rightFlanking;

      } else {

        canOpen =
          leftFlanking &&
          (!rightFlanking || isPunct(before));

        canClose =
          rightFlanking &&
          (!leftFlanking || isPunct(after));

      }

      addDelim(ch, run, canOpen, canClose);

      index += run;

      continue;

    }

    buffer += ch;

    index++;

  }

  flush();

  return { out };

}


/*
  Pairs each closing delimiter with the nearest
  opening delimiter that can match it. Consuming
  two characters at a time produces strong, one
  produces emphasis, and partially consumed runs
  stay in place for the next pass.
*/

function resolveEmphasis(entries) {

  let changed = true;

  let guard = 0;

  while (changed && guard < 500) {

    changed = false;

    guard++;

    outer:
    for (let ci = 0; ci < entries.length; ci++) {

      const closer = entries[ci].delim;

      if (!closer || closer.run <= 0) continue;

      if (!closer.canClose) continue;

      let oi = -1;

      for (let k = ci - 1; k >= 0; k--) {

        const opener = entries[k].delim;

        if (
          opener &&
          opener.run > 0 &&
          opener.canOpen &&
          opener.ch === closer.ch
        ) {

          oi = k;

          break;

        }

      }

      if (oi === -1) continue;

      const opener = entries[oi].delim;

      const use =
        opener.run >= 2 && closer.run >= 2
          ? 2
          : 1;

      const middle = [];

      for (
        let k = oi + 1;
        k < ci;
        k++
      ) {

        const entry = entries[k];

        if (entry.delim) {

          if (entry.delim.run > 0) {

            middle.push({
              node: document.createTextNode(
                entry.delim.ch.repeat(
                  entry.delim.run
                )
              )
            });

          }

          continue;

        }

        middle.push(entry);

      }

      if (!middle.length) continue;

      const wrap =
        use === 2 ? "strong" : "em";

      const el =
        document.createElement(wrap);

      middle.forEach((entry) => {

        el.appendChild(entry.node);

      });

      opener.run -= use;

      closer.run -= use;

      const replacement = [];

      if (opener.run > 0) {
        replacement.push(entries[oi]);
      }

      replacement.push({ node: el });

      if (closer.run > 0) {
        replacement.push(entries[ci]);
      }

      entries.splice(
        oi,
        ci - oi + 1,
        ...replacement
      );

      changed = true;

      break outer;

    }

  }

  return entries.map((entry) => {

    if (!entry.delim) return entry;

    if (entry.delim.run <= 0) return null;

    return {
      node: document.createTextNode(
        entry.delim.ch.repeat(entry.delim.run)
      )
    };

  }).filter(Boolean);

}


function appendInline(parent, text) {

  /*
    Inline math is extracted first so expressions such
    as $x_1 * y$ keep their asterisks. The math nodes
    are then treated as opaque atoms, which lets the
    emphasis pass still run over the rest of the line.
  */

  const entries = tokenizeMathInline(text);

  resolveEmphasis(entries).forEach((entry) => {

    parent.appendChild(entry.node);

  });

}


/* ================= BLOCK PARSER ================= */

const RULE =
  /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;

const TABLE_DIVIDER =
  /^\s{0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function isHeading(line) {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

function listItem(line) {

  const match = line.match(
    /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/
  );

  if (!match) return null;

  match[4] = line.match(/^\s*/)[0].length;

  return match;

}

function isOrderedItem(match) {

  return match[2] !== undefined;

}

function splitTableRow(line) {

  let value = line.trim();

  if (value.startsWith("|")) value = value.slice(1);

  if (
    value.endsWith("|") &&
    !value.endsWith("\\|")
  ) {

    value = value.slice(0, -1);

  }

  const cells = [];

  let current = "";

  for (let i = 0; i < value.length; i++) {

    const ch = value[i];

    if (ch === "\\" && value[i + 1] === "|") {

      current += "|";

      i++;

      continue;

    }

    if (ch === "|") {

      cells.push(current.trim());

      current = "";

      continue;

    }

    current += ch;

  }

  cells.push(current.trim());

  return cells;

}

/*
  Only well known schemes become clickable links.
  Anything else, including javascript: and data:,
  is written out as plain text.
*/

function sanitizeUrl(url) {

  const value = String(url).trim();

  if (/^(https?:|mailto:)/i.test(value)) {
    return value;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null;
  }

  if (value.startsWith("/")) return value;

  return null;

}


/*
  Single pass over the source lines. Handles fenced
  code first so markdown inside a block is never
  interpreted, including when the closing fence is
  missing because the reply was cut short.
*/

function renderMarkdown(container, text) {

  /*
    Display math is split out first so a formula
    spanning several lines reaches KaTeX intact
    instead of being broken up by the block parser.
  */

  splitDisplayMath(text).forEach((part) => {

    if (part.type === "math") {

      container.appendChild(
        makeMathNode(part.value, true)
      );

      return;

    }

    renderTextBlocks(container, part.value);

  });

}


function renderTextBlocks(container, text) {

  const lines =
    text.replace(/\r\n/g, "\n").split("\n");

  let index = 0;

  while (index < lines.length) {

    const line = lines[index];

    if (!line.trim()) {

      index++;

      continue;

    }


    /*
      Fenced code. An unterminated fence still
      renders as a code block instead of leaking
      raw backticks into a paragraph.
    */

    const fence = line.match(
      /^\s{0,3}(```+|~~~+)[ \t]*([A-Za-z0-9_+#.-]*)/
    );

    if (fence) {

      const char = fence[1][0];

      const closer = new RegExp(
        "^\\s{0,3}" +
        (char === "`" ? "```" : "~~~") +
        "[ \\t]*$"
      );

      const body = [];

      index++;

      while (
        index < lines.length &&
        !closer.test(lines[index])
      ) {

        body.push(lines[index]);

        index++;

      }

      if (
        index < lines.length &&
        closer.test(lines[index])
      ) {

        index++;

      }

      createCodeBlock(
        container,
        body.join("\n").replace(/\s+$/, ""),
        fence[2] || "code"
      );

      continue;

    }


    if (RULE.test(line)) {

      container.appendChild(
        document.createElement("hr")
      );

      index++;

      continue;

    }


    const atx = line.match(
      /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
    );

    if (atx) {

      const el =
        document.createElement(
          "h" + Math.min(atx[1].length, 6)
        );

      appendInline(el, atx[2]);

      container.appendChild(el);

      index++;

      continue;

    }


    /*
      Setext headings: the underline decides the
      level, so these must be read before the
      horizontal rule check below them.
    */

    const under = lines[index + 1];

    if (
      under !== undefined &&
      line.trim() &&
      /^\s{0,3}=+\s*$/.test(under)
    ) {

      const el =
        document.createElement("h1");

      appendInline(el, line.trim());

      container.appendChild(el);

      index += 2;

      continue;

    }

    if (
      under !== undefined &&
      line.trim() &&
      /^\s{0,3}-{2,}\s*$/.test(under) &&
      !listItem(line)
    ) {

      const el =
        document.createElement("h2");

      appendInline(el, line.trim());

      container.appendChild(el);

      index += 2;

      continue;

    }


    if (/^\s{0,3}>/.test(line)) {

      const quoted = [];

      while (
        index < lines.length &&
        (
          /^\s{0,3}>/.test(lines[index]) ||
          (
            lines[index].trim() &&
            quoted.length &&
            !listItem(lines[index])
          )
        )
      ) {

        quoted.push(
          lines[index].replace(
            /^\s{0,3}> ?/,
            ""
          )
        );

        index++;

      }

      const quote =
        document.createElement("blockquote");

      renderMarkdown(
        quote,
        quoted.join("\n")
      );

      container.appendChild(quote);

      continue;

    }


    if (
      line.includes("|") &&
      under !== undefined &&
      TABLE_DIVIDER.test(under)
    ) {

      const headers =
        splitTableRow(line);

      const aligns =
        splitTableRow(under).map(
          (cell) => {

            const left =
              cell.startsWith(":");

            const right =
              cell.endsWith(":");

            if (left && right) return "center";
            if (right) return "right";
            if (left) return "left";

            return null;

          }
        );

      index += 2;

      const table =
        document.createElement("table");

      const thead =
        document.createElement("thead");

      const headRow =
        document.createElement("tr");

      headers.forEach((text, cell) => {

        const th =
          document.createElement("th");

        if (aligns[cell]) {
          th.setAttribute(
            "align",
            aligns[cell]
          );
        }

        appendInline(th, text);

        headRow.appendChild(th);

      });

      thead.appendChild(headRow);

      table.appendChild(thead);

      const tbody =
        document.createElement("tbody");

      while (
        index < lines.length &&
        lines[index].trim() &&
        lines[index].includes("|")
      ) {

        const row =
          document.createElement("tr");

        splitTableRow(lines[index])
          .forEach((text, cell) => {

            const td =
              document.createElement("td");

            if (aligns[cell]) {
              td.setAttribute(
                "align",
                aligns[cell]
              );
            }

            appendInline(td, text);

            row.appendChild(td);

          });

        tbody.appendChild(row);

        index++;

      }

      table.appendChild(tbody);

      container.appendChild(table);

      continue;

    }


    const firstItem = listItem(line);

    if (firstItem) {

      const ordered =
        isOrderedItem(firstItem);

      const list =
        document.createElement(
          ordered ? "ol" : "ul"
        );

      if (ordered) {

        const start =
          parseInt(firstItem[2], 10);

        if (start > 1) {

          list.setAttribute(
            "start",
            start
          );

        }

      }

      let cursor = index;

      let pendingBreak = false;

      while (cursor < lines.length) {

        if (!lines[cursor].trim()) {

          /*
            A blank line only continues the list
            when another item of the same kind
            follows, which is what makes a loose
            list stay one list.
          */

          let peek = cursor;

          while (
            peek < lines.length &&
            !lines[peek].trim()
          ) {

            peek++;

          }

          const nextItem =
            peek < lines.length
              ? listItem(lines[peek])
              : null;

          if (
            nextItem &&
            isOrderedItem(nextItem) === ordered
          ) {

            pendingBreak = true;

            cursor = peek;

            continue;

          }

          break;

        }

        const item = listItem(lines[cursor]);

        if (
          !item ||
          isOrderedItem(item) !== ordered
        ) {

          break;

        }

        const li =
          document.createElement("li");

        if (pendingBreak) {
          li.setAttribute("data-loose", "");
        }

        appendInline(li, item[3]);

        list.appendChild(li);

        pendingBreak = false;

        cursor++;

      }

      container.appendChild(list);

      index = cursor;

      continue;

    }


    const paragraph =
      document.createElement("p");

    const chunk = [];

    while (
      index < lines.length &&
      lines[index].trim() &&
      !RULE.test(lines[index]) &&
      !isHeading(lines[index]) &&
      !listItem(lines[index]) &&
      !/^\s{0,3}>/.test(lines[index]) &&
      !/^\s{0,3}(?:```|~~~)/.test(lines[index]) &&
      !(
        lines[index].includes("|") &&
        lines[index + 1] !== undefined &&
        TABLE_DIVIDER.test(lines[index + 1])
      ) &&
      !(
        lines[index + 1] !== undefined &&
        lines[index].trim() &&
        (
          /^\s{0,3}=+\s*$/.test(lines[index + 1]) ||
          /^\s{0,3}-{2,}\s*$/.test(lines[index + 1])
        ) &&
        !listItem(lines[index])
      )
    ) {

      chunk.push(lines[index]);

      index++;

    }

    appendInline(
      paragraph,
      chunk.join("\n")
    );

    container.appendChild(paragraph);

  }

}


function createCodeBlock(
  container,
  code,
  language
) {

  const block =
    document.createElement("div");

  block.className = "code-block";

  const header =
    document.createElement("div");

  header.className = "code-header";

  const label =
    document.createElement("span");

  label.textContent = language;

  const copyButton =
    document.createElement("button");

  copyButton.type = "button";

  copyButton.className = "copy-code";

  copyButton.textContent = "Copy";

  copyButton.addEventListener(
    "click",
    async () => {

      try {

        await navigator.clipboard.writeText(code);

      } catch (error) {

        const helper =
          document.createElement("textarea");

        helper.value = code;

        helper.style.position = "fixed";

        helper.style.opacity = "0";

        document.body.appendChild(helper);

        helper.select();

        document.execCommand("copy");

        helper.remove();

      }

      copyButton.textContent = "Copied ✓";

      copyButton.classList.add("copied");

      setTimeout(() => {

        copyButton.textContent = "Copy";

        copyButton.classList.remove("copied");

      }, 1600);

    }
  );

  header.appendChild(label);

  header.appendChild(copyButton);

  const scroll =
    document.createElement("div");

  scroll.className = "code-scroll";

  const pre =
    document.createElement("pre");

  pre.textContent = code;

  scroll.appendChild(pre);

  block.appendChild(header);

  block.appendChild(scroll);

  container.appendChild(block);

}


