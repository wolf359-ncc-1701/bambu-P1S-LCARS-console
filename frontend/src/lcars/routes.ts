import type { RouteRecordRaw } from 'vue-router'
import { ROUTE_NAME } from '../router/names'
import HomeView from './views/HomeView.vue'
import EngineeringView from './views/EngineeringView.vue'
import StoresView from './views/StoresView.vue'

/* Five tabs, as in the original app: home, printer control, AMS, files, settings.
   The everyday tabs are in the entry chunk; rarer pages load on first visit. */
export const lcarsRoutes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: ROUTE_NAME.HOME, component: HomeView },
  { path: '/control', name: ROUTE_NAME.CONTROL, component: EngineeringView },
  { path: '/control/align', name: ROUTE_NAME.CONTROL_MOTION, redirect: { path: '/control', query: { m: 'align' } } },
  { path: '/ams', name: ROUTE_NAME.FILAMENT, component: StoresView },
  { path: '/ams/pattern/:ams_id/:tray_id', name: ROUTE_NAME.FILAMENT_EDIT, component: () => import('./views/PatternView.vue'), meta: { section: 'pattern' } },
  { path: '/files', name: ROUTE_NAME.HOME_FILES, component: () => import('./views/LibraryView.vue') },
  { path: '/setting', name: ROUTE_NAME.SETTING_HOME, component: () => import('./views/OpsView.vue') },
  {
    path: '/setting/device',
    component: () => import('./views/LegacyFrame.vue'),
    children: [
      { path: 'add', name: ROUTE_NAME.SETTING_DEVICE_ADD, component: () => import('../views/setting/DeviceAddPage.vue') },
      { path: 'edit/:serial', name: ROUTE_NAME.SETTING_DEVICE_EDIT, component: () => import('../views/setting/DeviceEditPage.vue'), props: true },
    ],
  },
  { path: '/alerts', name: ROUTE_NAME.MESSAGE, component: () => import('./views/AlertsView.vue'), meta: { section: 'alerts' } },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
]
