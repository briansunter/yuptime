import { Outlet } from "@tanstack/react-router";

export default function PublicLayout() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <Outlet />
    </div>
  );
}
