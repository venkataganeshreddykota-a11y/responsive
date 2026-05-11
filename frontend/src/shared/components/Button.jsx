// Reusable Button component
export default function Button({ children, variant = "primary", size = "md", ...props }) {
  const baseClasses = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition";
  const variants = {
    primary: "bg-accent-500 text-white hover:bg-accent-600 shadow-orange-glow",
    secondary: "border border-surface-border bg-white text-surface-label hover:bg-stone-50",
    danger: "bg-red-500 text-white hover:bg-red-600",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  
  return (
    <button className={`${baseClasses} ${variants[variant]} ${sizes[size]}`} {...props}>
      {children}
    </button>
  );
}
