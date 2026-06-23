export function Modal({ title, children, onClose, size = 'md' }) {
  const sizeClass = size === 'xl' ? 'modal-xl' : size === 'lg' ? 'modal-lg' : 'modal-md';

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className={`modal ${sizeClass}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            x
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
