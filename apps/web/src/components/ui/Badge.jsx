/** UI component for Badge in the Relay web application. */

const variants = {
  primary: "badge-primary",
  secondary: "badge-secondary",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-error",
  info: "badge-info",
  neutral: "badge-neutral",
  outline: "badge-outline",
};

const sizes = {
  sm: "badge-sm",
  md: "",
  lg: "badge-lg",
};

export default function Badge({
  children,
  variant = "neutral",
  size = "md",
  dot = false,
  className = "",
  ...props
}) {
  return (
    <span
      className={[
        "badge gap-1.5 font-medium",
        variants[variant] ?? variants.neutral,
        sizes[size] ?? sizes.md,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {dot && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
