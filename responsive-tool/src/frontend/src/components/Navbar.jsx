import { Link, useLocation } from "react-router-dom";
import { HiOutlineBolt } from "react-icons/hi2";

const links = [
  { to: "/dashboard", label: "Dashboard"        },
  { to: "/scanner",   label: "Responsive Viewer" },
  { to: "/history",   label: "History"           },
];

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-surface-border bg-white/80 backdrop-blur-xl">
      <div className="flex min-h-[56px] w-full flex-wrap items-center gap-3 px-4 py-2 sm:flex-nowrap sm:px-6">

        <Link to="/dashboard" className="flex items-center gap-2 no-underline">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500 text-white shadow-orange-glow">
            <HiOutlineBolt size={15} />
          </span>
          <span className="text-sm font-semibold tracking-tight text-surface-body">
            ResponsiveTool
          </span>
        </Link>

        <span className="hidden h-4 w-px bg-surface-border sm:block" />

        <div className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto">
          {links.map(({ to, label }) => {
            const active = pathname.startsWith(to);
            return (
              <Link key={to} to={to}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-all no-underline",
                  active
                    ? "bg-accent-500/10 text-accent-600"
                    : "text-surface-label hover:bg-black/5 hover:text-surface-body",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
        </div>
      </div>
    </nav>
  );
}
