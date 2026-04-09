import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BikeTripAnalyzer from "./BikeTripAnalyzer";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BikeTripAnalyzer />
  </StrictMode>
);