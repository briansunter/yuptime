import { RootRoute, Route, Router } from "@tanstack/react-router";
import RootLayout from "./routes/__root";
import PublicLayout from "./routes/public-root";
import IndexPage from "./routes/index";
import MonitorDetailPage from "./routes/monitor-detail";
import PublicStatusPage from "./routes/public-status";

// Root route
const rootRoute = new RootRoute({
  component: RootLayout,
});

// Index route (dashboard/welcome)
const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});

// Monitor detail route
const monitorDetailRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/monitors/$monitorId",
  component: MonitorDetailPage,
});

// Status layout route (no sidebar)
const statusLayoutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/status",
  component: PublicLayout,
});

// Status page route
const statusPageRoute = new Route({
  getParentRoute: () => statusLayoutRoute,
  path: "$slug",
  component: PublicStatusPage,
});

// Create route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  monitorDetailRoute,
  statusLayoutRoute.addChildren([statusPageRoute]),
]);

// Create router
const router = new Router({ routeTree });

// Register router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default router;
