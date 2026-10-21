/** UI component for Input in the Relay web application. */

import { useId } from "react";

export default function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  rightAdornment,
  id,
  className = "",
  wrapperClassName = "",
  fieldClassName = "",
  labelClassName = "",
  unstyled = false,
  ...props
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const message = error || helperText;

  const inputClasses = unstyled
    ? [
        "min-w-0 w-full bg-transparent text-sm outline-none",
        "placeholder:text-slate-500 focus:outline-none focus:ring-0",
        leftIcon ? "pl-10" : "",
        rightIcon || rightAdornment ? "pr-10" : "",
        error ? "border-red-400" : "",
        className,
      ]
    : [
        "input input-bordered w-full rounded-[var(--app-radius-md)]",
        leftIcon ? "pl-10" : "",
        rightIcon || rightAdornment ? "pr-10" : "",
        error ? "input-error" : "",
        className,
      ];

  if (
    unstyled &&
    !label &&
    !message &&
    !leftIcon &&
    !rightIcon &&
    !rightAdornment
  ) {
    return (
      <input
        id={inputId}
        className={inputClasses.filter(Boolean).join(" ")}
        aria-invalid={undefined}
        aria-describedby={undefined}
        {...props}
      />
    );
  }

  return (
    <div className={["form-control w-full", wrapperClassName].filter(Boolean).join(" ")}>
      {label && (
        <label
          htmlFor={inputId}
          className={[
            "label pb-2",
            labelClassName,
          ].filter(Boolean).join(" ")}
        >
          <span className="label-text font-medium">{label}</span>
        </label>
      )}

      <div
        className={[
          "relative flex items-center",
          fieldClassName,
        ].filter(Boolean).join(" ")}
      >
        {leftIcon && (
          <span
            className="pointer-events-none absolute left-3 z-10 flex items-center"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}

        <input
          id={inputId}
          className={inputClasses.filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? descriptionId : undefined}
          {...props}
        />

        {rightIcon && (
          <span
            className="pointer-events-none absolute right-3 flex items-center"
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}

        {rightAdornment && (
          <span className="absolute right-2 z-10 flex items-center">
            {rightAdornment}
          </span>
        )}
      </div>

      {message && (
        <p
          id={descriptionId}
          className={`mt-1.5 text-sm ${
            error ? "text-error" : "text-base-content/60"
          }`}
          role={error ? "alert" : undefined}
        >
          {message}
        </p>
      )}
    </div>
  );
}
