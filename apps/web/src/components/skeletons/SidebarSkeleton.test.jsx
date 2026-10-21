/** Tests for SidebarSkeleton test in the web. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SidebarSkeleton from "./SidebarSkeleton";

describe("SidebarSkeleton", () => {
  it("renders the sidebar landmark", () => {
    render(<SidebarSkeleton />);

    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("renders eight contact placeholders", () => {
    const { container } = render(<SidebarSkeleton />);
    const list = container.querySelector(".flex-1.space-y-1");

    expect(list).toBeInTheDocument();
    expect(list.children).toHaveLength(8);
  });

  it("renders skeleton elements for loading content", () => {
    const { container } = render(<SidebarSkeleton />);

    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(20);
  });

  it("marks the decorative users icon as hidden from assistive technology", () => {
    const { container } = render(<SidebarSkeleton />);

    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("does not render interactive controls while loading", () => {
    const { container } = render(<SidebarSkeleton />);

    expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
  });
});
