import { createTheme } from "@mui/material/styles";

// Dark theme echoing the UVR desktop app's look.
export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#5c6bc0" },
    secondary: { main: "#26c6da" },
    background: { default: "#0f1117", paper: "#171a23" },
  },
  shape: { borderRadius: 10 },
});
