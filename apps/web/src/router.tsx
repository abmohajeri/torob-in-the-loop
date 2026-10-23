/**
 * All routes (ARCHITECTURE §10). Pages are code-split (`lazy`) — each page file default-exports its component.
 * Shell chrome per route is declared in `handle` (see components/layout/AppShell.tsx → ShellHandle).
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, isRouteErrorResponse, useRouteError, type RouteObject } from 'react-router';
import { AppShell, type ShellHandle } from './components/layout/AppShell.js';
import { ErrorState } from './components/ui/ErrorState.js';
import { Button } from './components/ui/Button.js';

const page = (load: () => Promise<{ default: ComponentType }>): LazyExoticComponent<ComponentType> => lazy(load);

export const Pages = {
  Home: page(() => import('./pages/HomePage.js')),
  Search: page(() => import('./pages/SearchPage.js')),
  Product: page(() => import('./pages/ProductPage.js')),
  ProductStores: page(() => import('./pages/ProductStoresPage.js')),
  Compare: page(() => import('./pages/ComparePage.js')),
  CompareStores: page(() => import('./pages/CompareStoresPage.js')),
  Shop: page(() => import('./pages/ShopPage.js')),
  Mall: page(() => import('./pages/MallPage.js')),
  Inquiries: page(() => import('./pages/InquiriesPage.js')),
  InquiryDetail: page(() => import('./pages/InquiryDetailPage.js')),
  Plan: page(() => import('./pages/PlanPage.js')),
  Seller: page(() => import('./pages/SellerPage.js')),
  SellerInbox: page(() => import('./pages/SellerInboxPage.js')),
  About: page(() => import('./pages/AboutPage.js')),
  NotFound: page(() => import('./pages/NotFoundPage.js')),
  DevGallery: page(() => import('./dev/DevGalleryPage.js')),
};

function RouteError() {
  const error = useRouteError();
  const chunk = error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
  return (
    <div className="mx-auto max-w-[var(--app-max)] px-4 pt-16">
      <ErrorState
        title={chunk ? 'نسخه تازه‌ای منتشر شده است' : 'مشکلی پیش آمد'}
        description={
          chunk
            ? 'برای ادامه، صفحه را یک بار تازه کنید.'
            : isRouteErrorResponse(error)
              ? `خطای ${error.status}`
              : 'متأسفیم؛ این صفحه درست بارگذاری نشد. دوباره تلاش کنید.'
        }
        actions={<Button onClick={() => window.location.reload()}>تازه کردن صفحه</Button>}
      />
    </div>
  );
}

const h = (handle: ShellHandle) => handle;

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Pages.Home />, handle: h({ header: 'app', contextBar: true }) },
      { path: '/search', element: <Pages.Search />, handle: h({ header: 'app', contextBar: true }) },
      { path: '/p/:id', element: <Pages.Product /> },
      { path: '/p/:id/stores', element: <Pages.ProductStores /> },
      { path: '/compare', element: <Pages.Compare /> },
      { path: '/compare/stores', element: <Pages.CompareStores /> },
      { path: '/shop/:id', element: <Pages.Shop /> },
      { path: '/mall/:slug', element: <Pages.Mall /> },
      { path: '/inquiries', element: <Pages.Inquiries /> },
      { path: '/inquiries/:id', element: <Pages.InquiryDetail /> },
      { path: '/plan', element: <Pages.Plan /> },
      { path: '/seller', element: <Pages.Seller />, handle: h({ nav: false }) },
      { path: '/seller/:shopId', element: <Pages.SellerInbox />, handle: h({ nav: false }) },
      { path: '/about', element: <Pages.About /> },
      { path: '/_dev', element: <Pages.DevGallery />, handle: h({ nav: false }) },
      { path: '*', element: <Pages.NotFound /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
