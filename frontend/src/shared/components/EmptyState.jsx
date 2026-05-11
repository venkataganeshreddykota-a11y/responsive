export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-surface-muted">
      {Icon && <Icon size={32} className="opacity-20" />}
      {title && <p className="text-sm font-semibold text-surface-body">{title}</p>}
      {description && <p className="text-xs text-surface-muted">{description}</p>}
      {action}
    </div>
  );
}
