import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({
  children,
  variant = "dark",
}: {
  children: string;
  variant?: "paper" | "dark";
}) {
  return (
    <div className={variant === "paper" ? "md-paper" : "md-dark"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
