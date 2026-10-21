/** UI component for Card in the Relay web application. */

import { useId } from "react";

const paddingVariants = {
  none: {
    body: "",
    header: "",
    footer: "",
  },
  sm: {
    body: "p-3",
    header: "px-3 pt-3",
    footer: "px-3 py-3",
  },
  md: {
    body: "p-5 sm:p-6",
    header: "px-5 pt-5 sm:px-6 sm:pt-6",
    footer: "px-5 py-4 sm:px-6",
  },
  lg: {
    body: "p-6 sm:p-8",
    header: "px-6 pt-6 sm:px-8 sm:pt-8",
    footer: "px-6 py-5 sm:px-8",
  },
};

export default function Card({
  children,
  title,
  description,
  footer,
  padding = "md",
  as = "section",
  titleAs = "h2",
  className = "",
  unstyled = false,
  ...props
}) {
  const generatedId = useId();
  const headingId = `${generatedId}-heading`;
  const descriptionId = `${generatedId}-description`;
  const spacing = paddingVariants[padding] ?? paddingVariants.md;
  const Container = as;
  const Heading = titleAs;

  return (
    <Container
      className={[
        !unstyled && "card border border-base-300 bg-base-100",
        !unstyled && "rounded-[var(--app-radius-xl)] shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={title ? headingId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      {...props}
    >
      {(title || description) && (
        <div className={spacing.header}>
          {title && (
            <Heading id={headingId} className="text-lg font-semibold">
              {title}
            </Heading>
          )}
          {description && (
            <p
              id={descriptionId}
              className="mt-1 text-sm text-base-content/60"
            >
              {description}
            </p>
          )}
        </div>
      )}

      <div className={spacing.body}>{children}</div>

      {footer && (
        <div className={["border-t border-base-300", spacing.footer]
          .filter(Boolean)
          .join(" ")}
        >
          {footer}
        </div>
      )}
    </Container>
  );
}
