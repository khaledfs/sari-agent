export default function AdminDashboardLoading() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "4rem 1rem",
    }}>
      <div className="admin-spinner" />
    </div>
  );
}
