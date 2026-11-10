import { beforeEach, describe, expect, it, vi } from "vitest";

const loadThemeStore = async () => {
  vi.resetModules();
  return import("./useThemeStore");
};

describe("useThemeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("defaults to light when no preference is saved", async () => {
    const { useThemeStore } = await loadThemeStore();

    expect(useThemeStore.getState().theme).toBe("light");
  });

  it.each(["coffee", "dark", "corporate", "nord"])(
    "preserves the saved %s theme",
    async (theme) => {
      localStorage.setItem("chat-theme", theme);

      const { useThemeStore } = await loadThemeStore();

      expect(useThemeStore.getState().theme).toBe(theme);
    },
  );

  it("falls back to light for an unsupported saved theme", async () => {
    localStorage.setItem("chat-theme", "relay");

    const { useThemeStore } = await loadThemeStore();

    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("persists a valid theme selection", async () => {
    const { useThemeStore } = await loadThemeStore();

    useThemeStore.getState().setTheme("coffee");

    expect(useThemeStore.getState().theme).toBe("coffee");
    expect(localStorage.getItem("chat-theme")).toBe("coffee");
  });

  it("falls back to light when asked to set an unsupported theme", async () => {
    const { useThemeStore } = await loadThemeStore();

    useThemeStore.getState().setTheme("relay");

    expect(useThemeStore.getState().theme).toBe("light");
    expect(localStorage.getItem("chat-theme")).toBe("light");
  });
});
