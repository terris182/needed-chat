import type { Block } from "@/lib/blog";

export default function ArticleBody({ body }: { body: Block[] }) {
  return (
    <div className="mt-8 space-y-5">
      {body.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                className="mt-10 text-xl font-semibold tracking-tight text-ink"
              >
                {block.text}
              </h2>
            );
          case "p":
            return (
              <p key={i} className="text-base text-ink-soft leading-relaxed">
                {block.text}
              </p>
            );
          case "ul":
            return (
              <ul
                key={i}
                className="list-disc space-y-2 pl-5 text-base text-ink-soft leading-relaxed"
              >
                {block.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-2 border-accent pl-4 text-base italic text-ink-soft leading-relaxed"
              >
                {block.text}
              </blockquote>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
