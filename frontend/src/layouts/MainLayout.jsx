// Main layout wrapper — used by most pages
export default function MainLayout({ children }) {
  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-surface-bg">
      {children}
    </div>
  );
}
