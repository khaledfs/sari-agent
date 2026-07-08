export default function CustomerDashboardLoading() {
  return (
    <main className="ds-page" aria-busy="true" aria-live="polite">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 1rem",
          minHeight: "12rem",
        }}
      >
        <div className="admin-spinner" />
      </div>
    </main>
  );
}
