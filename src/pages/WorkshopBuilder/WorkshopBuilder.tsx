import WorkshopShell from "@/components/WorkshopShell/WorkshopShell";

export default function WorkshopBuilder() {
  const pathParts = window.location.pathname.split("/");
  const appId = pathParts.length > 3 ? pathParts[pathParts.length - 1] : undefined;

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <WorkshopShell appId={appId} />
    </div>
  );
}
