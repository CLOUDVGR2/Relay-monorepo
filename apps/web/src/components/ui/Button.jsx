/** UI component for Button in the Relay web application. */

import { LoaderCircle } from "lucide-react";

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-error",
};

const sizes = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  className = "",
  type = "button",
  disabled = false,
  ...props
}) {
  const variantClass = variants[variant] ?? variants.primary;
  const sizeClass = sizes[size] ?? sizes.md;

  return (
    <button
      type={type}
      className={[
        "btn gap-2 rounded-[var(--app-radius-md)]",
        "transition-[background-color,border-color,opacity]",
        variantClass,
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle
          size={18}
          className="animate-spin"
          aria-hidden="true"
        />
      ) : (
        leftIcon
      )}

      {children}

      {!loading && rightIcon}
    </button>
  );
}
