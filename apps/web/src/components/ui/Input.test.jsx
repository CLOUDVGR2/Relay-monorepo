/** Tests for Input test in the web. */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Input from "./Input";

describe("Input", () => {
  it("associates its label with the input", () => {
    render(<Input label="Email address" name="email" />);

    expect(
      screen.getByRole("textbox", { name: "Email address" })
    ).toBeInTheDocument();
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();

    render(<Input label="Display name" />);

    const input = screen.getByRole("textbox", {
      name: "Display name",
    });

    await user.type(input, "Alex Morgan");

    expect(input).toHaveValue("Alex Morgan");
  });

  it("announces validation errors accessibly", () => {
    render(
      <Input
        label="Email address"
        error="Enter a valid email address."
      />
    );

    const input = screen.getByRole("textbox", {
      name: "Email address",
    });

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid email address."
    );
  });

  it("connects helper text to its input", () => {
    render(
      <Input
        label="Username"
        helperText="Use at least 3 characters."
      />
    );

    const input = screen.getByRole("textbox", { name: "Username" });
    const descriptionId = input.getAttribute("aria-describedby");

    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId)).toHaveTextContent(
      "Use at least 3 characters."
    );
  });

  it("supports required fields", () => {
    render(<Input label="Password" type="password" required />);

    expect(
      screen.getByLabelText("Password")
    ).toBeRequired();
  });

  it("renders a minimal unstyled input without a wrapper", () => {
    const { container } = render(
      <Input unstyled placeholder="Search Relay" name="search" />,
    );

    const input = screen.getByPlaceholderText("Search Relay");
    expect(input).toHaveAttribute("name", "search");
    expect(input.className).toContain("bg-transparent");
    expect(container.querySelector(".form-control")).toBeNull();
  });

  it("uses a supplied ID and generates unique IDs when omitted", () => {
    const { rerender } = render(<Input id="relay-email" label="Email" />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "relay-email");

    rerender(
      <>
        <Input label="First field" />
        <Input label="Second field" />
      </>,
    );

    const first = screen.getByLabelText("First field");
    const second = screen.getByLabelText("Second field");

    expect(first.id).toBeTruthy();
    expect(second.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
  });

  it("renders icons and a right adornment", () => {
    render(
      <Input
        label="Search"
        leftIcon={<span>Left icon</span>}
        rightIcon={<span>Right icon</span>}
        rightAdornment={<button type="button">Clear</button>}
      />,
    );

    expect(screen.getByText("Left icon")).toBeInTheDocument();
    expect(screen.getByText("Right icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();

    const input = screen.getByRole("textbox", { name: "Search" });
    expect(input.className).toContain("pl-10");
    expect(input.className).toContain("pr-10");
  });

  it("applies custom wrapper, field, label, and input classes", () => {
    const { container } = render(
      <Input
        label="Workspace"
        wrapperClassName="custom-wrapper"
        fieldClassName="custom-field"
        labelClassName="custom-label"
        className="custom-input"
      />,
    );

    expect(container.querySelector(".custom-wrapper")).toBeInTheDocument();
    expect(container.querySelector(".custom-field")).toBeInTheDocument();
    expect(container.querySelector(".custom-label")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Workspace" })).toHaveClass(
      "custom-input",
    );
  });

  it("prefers the error message over helper text", () => {
    render(
      <Input
        label="Password"
        error="Password is required."
        helperText="Use at least 8 characters."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Password is required.");
    expect(screen.queryByText("Use at least 8 characters.")).not.toBeInTheDocument();
  });

  it("handles accessibility attributes with and without errors in minimal mode", () => {
    const { rerender } = render(
      <Input unstyled aria-label="Plain field" />,
    );

    const plainInput = screen.getByRole("textbox", { name: "Plain field" });

    expect(plainInput).not.toHaveAttribute("aria-invalid");
    expect(plainInput).not.toHaveAttribute("aria-describedby");

    rerender(
      <Input
        unstyled
        aria-label="Plain field"
        error="Invalid value"
      />,
    );

    const invalidInput = screen.getByRole("textbox", { name: "Plain field" });

    expect(invalidInput).toHaveAttribute("aria-invalid", "true");
    expect(invalidInput).toHaveAttribute("aria-describedby");
  });

  it("applies accessible error styling to an unstyled input", () => {
    render(<Input unstyled error="Invalid value" aria-label="Custom field" />);

    const input = screen.getByRole("textbox", { name: "Custom field" });

    expect(input).toHaveClass("border-red-400");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby");
  });

  it("applies icon spacing in unstyled mode", () => {
    render(
      <Input
        unstyled
        label="Search"
        leftIcon={<span>Search icon</span>}
        rightIcon={<span>Clear icon</span>}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Search" });

    expect(input).toHaveClass("pl-10");
    expect(input).toHaveClass("pr-10");
    expect(screen.getByText("Search icon")).toBeInTheDocument();
    expect(screen.getByText("Clear icon")).toBeInTheDocument();
  });

});
