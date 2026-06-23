export function Toast({ toast, onClose }) {
  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type || 'info'}`}>
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss">x</button>
    </div>
  );
}
