export function PagePending() {
  return (
    <section className="view active page-pending" aria-busy="true" aria-live="polite">
      <header className="view-header">
        <div>
          <div className="page-pending-title" />
          <div className="page-pending-sub" />
        </div>
      </header>
      <div className="page-pending-body">
        <div className="page-pending-line" />
        <div className="page-pending-line" />
        <div className="page-pending-line short" />
      </div>
    </section>
  )
}
