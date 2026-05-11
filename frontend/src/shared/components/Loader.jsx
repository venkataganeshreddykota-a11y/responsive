export default function Loader({ size = "md", label }) {
  const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10" };
  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`animate-spin rounded-full border-2 border-surface-border border-t-accent-500 ${sizes[size]}`} />
      {label && <p className="text-xs text-surface-muted">{label}</p>}
    </div>
  );
}
