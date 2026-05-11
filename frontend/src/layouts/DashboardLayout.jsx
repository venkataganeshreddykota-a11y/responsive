// Dashboard layout — sidebar + main content area
export default function DashboardLayout({ sidebar, children }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      {sidebar && (
        <aside className="flex w-full shrink-0 flex-col border-b border-surface-border lg:w-72 lg:border-b-0 lg:border-r">
          {sidebar}
        </aside>
      )}
      <main className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
