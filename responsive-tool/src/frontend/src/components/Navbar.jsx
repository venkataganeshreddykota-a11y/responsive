import { Link, useLocation } from "react-router-dom";
import { HiOutlineBolt } from "react-icons/hi2";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/scanner",   label: "Scanner"   },
];

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav className="sticky top-0 z-50 border-b border-surface-border glass">
      <div className="mx-auto flex max-w-5xl items-center gap-5 px-4 sm:px-6" style={{ height: 52 }}>

        <Link to="/dashboard" className="flex items-center gap-2 no-underline">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500 text-white shadow-orange-glow">
            <HiOutlineBolt size={15} />
          </span>
          <span className="text-sm font-semibold tracking-tight text-surface-body">
            ResponsiveTool
          </span>
        </Link>

        <span className="h-4 w-px bg-surface-border" />

        <div className="flex items-center gap-0.5">
          {links.map(({ to, label }) => {
            const active = pathname.startsWith(to);
            return (
              <Link key={to} to={to}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-all no-underline",
                  active
                    ? "bg-accent-500/10 text-accent-600 font-semibold"
                    : "text-surface-label hover:bg-black/5 hover:text-surface-body",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto">
          <span className="rounded-full border border-accent-200 bg-accent-50 px-2.5 py-0.5 text-xs font-medium text-accent-600">
            Beta
          </span>
        </div>
      </div>
    </nav>
  );
}
