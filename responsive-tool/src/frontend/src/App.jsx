import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes";

export default function App() {
  return (
    <div className="flex h-full min-h-screen w-full flex-col">
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}
