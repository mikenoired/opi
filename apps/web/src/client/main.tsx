import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	Outlet,
	RouterProvider,
	useParams,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";

import DashboardContent from "@/app/dashboard/dashboard-content";
import HomePage from "@/app/page";
import { apiClient, unwrap } from "@/shared/api/client";
import type { ContentTags, Graph } from "@/shared/api/contracts";
import { apiUrl } from "@/shared/config/api";
import { AuthProvider, useAuth } from "@/shared/lib/auth-context";
import { DashboardProvider } from "@/shared/lib/dashboard-context";
import { UserPreferencesProvider } from "@/shared/lib/user-preferences-context";
import { ModalProvider } from "@/widgets/modals/context/modal-context";
import { ModalManager } from "@/widgets/modals/context/modal-manager";
import { SettingsModalController } from "@/widgets/settings-modal/ui/settings-modal-controller";
import Sidebar from "@/widgets/sidebar/ui/sidebar";

import "@/app/globals.css";

const DashboardClient = lazyRouteComponent(() => import("@/app/dashboard/page.client"));
const GraphClient = lazyRouteComponent(() => import("@/app/dashboard/graph/pageClient"));
const TagClient = lazyRouteComponent(() => import("@/app/dashboard/tag/[id]/page.client"));
const TagsClient = lazyRouteComponent(() => import("@/app/dashboard/tags/page.client"));

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 60_000, gcTime: 300_000, retry: 1, refetchOnWindowFocus: false },
		mutations: { retry: 1 },
	},
});

function Root() {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<SyncListener />
				<UserPreferencesProvider>
					<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
						<ModalProvider>
							<Outlet />
							<ModalManager />
							<Toaster position="bottom-right" />
						</ModalProvider>
					</ThemeProvider>
				</UserPreferencesProvider>
			</AuthProvider>
		</QueryClientProvider>
	);
}

function SyncListener() {
	const { user } = useAuth();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!user) return;

		const events = new EventSource(apiUrl("/sync/events"), { withCredentials: true });
		const invalidateSyncedData = () => {
			void queryClient.invalidateQueries({
				predicate: (query) => ["content", "graph", "user"].includes(String(query.queryKey[0])),
			});
		};
		events.addEventListener("change", invalidateSyncedData);

		return () => events.close();
	}, [queryClient, user?.id]);

	return null;
}

function DashboardShell() {
	const { user, loading } = useAuth();
	if (loading) return null;
	if (!user) return <HomePage />;
	return (
		<DashboardProvider>
			<div className="flex h-screen min-h-0 w-full overflow-hidden bg-background dark:bg-muted">
				<Sidebar />
				<DashboardContent>
					<Outlet />
				</DashboardContent>
				<SettingsModalController />
			</div>
		</DashboardProvider>
	);
}

function GraphRoute() {
	const graph = useQuery({ queryKey: ["graph"], queryFn: () => unwrap<Graph>(apiClient.graph.$get()) });
	if (!graph.data) return null;
	return <GraphClient nodes={graph.data.nodes} edges={graph.data.edges} />;
}

function TagsRoute() {
	return <TagsClient initial={undefined} />;
}

function TagRoute() {
	const { id } = useParams({ from: "/dashboard-shell/tags/$id" });
	const tags = useQuery({
		queryKey: ["content", "tags"],
		queryFn: () => unwrap<ContentTags>(apiClient.content.tags.$get()),
	});
	const tag = tags.data?.find((candidate) => candidate.id === id);
	return (
		<TagClient tagId={id} tagTitle={tag?.title ?? ""} initialColor={tag?.color ?? 0} initial={undefined} />
	);
}

const rootRoute = createRootRoute({ component: Root });
const dashboardRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: "dashboard-shell",
	component: DashboardShell,
});
const dashboardIndexRoute = createRoute({
	getParentRoute: () => dashboardRoute,
	path: "/",
	component: () => <DashboardClient initial={undefined} />,
});
const tagsRoute = createRoute({ getParentRoute: () => dashboardRoute, path: "tags", component: TagsRoute });
const tagRoute = createRoute({ getParentRoute: () => dashboardRoute, path: "tags/$id", component: TagRoute });
const graphRoute = createRoute({
	getParentRoute: () => dashboardRoute,
	path: "graph",
	component: GraphRoute,
});
const routeTree = rootRoute.addChildren([
	dashboardRoute.addChildren([dashboardIndexRoute, tagsRoute, tagRoute, graphRoute]),
]);
const router = createRouter({ routeTree, context: {} });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
);
