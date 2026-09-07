import { createTheme } from "@mui/material";

export type ConfigThemeMode = "light" | "dark";

export function getConfigThemeMode(
    darkThemeEnabled: boolean | null | undefined,
): ConfigThemeMode {
    return darkThemeEnabled ? "dark" : "light";
}

export function createConfigTheme(mode: ConfigThemeMode) {
    const isDark = mode === "dark";

    return createTheme({
        palette: {
            mode,
            primary: {
                main: "#2563eb",
                light: "#60a5fa",
                dark: "#1d4ed8",
                contrastText: "#ffffff",
            },
            secondary: {
                main: isDark ? "#60a5fd" : "#2563eb",
                light: isDark ? "#93c5fd" : "#60a5fa",
                dark: isDark ? "#3b82f6" : "#1d4ed8",
            },
            background: isDark
                ? {
                      default: "#0b1220",
                      paper: "#111827",
                  }
                : {
                      default: "#f3f7fb",
                      paper: "#ffffff",
                  },
            text: isDark
                ? {
                      primary: "#e5e7eb",
                      secondary: "#93a4b8",
                  }
                : {
                      primary: "#0f172a",
                      secondary: "#475569",
                  },
            divider: isDark ? "#243145" : "#d7e1ee",
        },
        typography: {
            fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
        },
        shape: {
            borderRadius: 8,
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    html: {
                        width: "100%",
                        height: "100%",
                        margin: 0,
                    },
                    body: {
                        margin: 0,
                        minHeight: "100vh",
                        width: "100%",
                        height: "100%",
                        background: isDark ? "#0b1220" : "#f3f7fb",
                        color: isDark ? "#e5e7eb" : "#0f172a",
                        padding: 0,
                        "&:lang(zh-CN)": {
                            fontFamily:
                                'Inter, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif',
                        },
                    },
                    "#app": {
                        minHeight: "100%",
                        width: "100%",
                    },
                },
            },
            MuiButton: {
                defaultProps: {
                    disableElevation: true,
                },
                styleOverrides: {
                    root: {
                        textTransform: "none",
                        borderRadius: 8,
                        fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
                        "&:lang(zh-CN)": {
                            fontFamily:
                                'Inter, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif',
                        },
                    },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: "none",
                    },
                },
            },
        },
    });
}
