<template>
  <!-- Device registration and editing keep their original forms (cloud login, LAN pairing):
       they are rarely visited, so they are re-themed in place instead of rebuilt. -->
  <div class="legacy">
    <RouterView />
  </div>
</template>

<script setup lang="ts">
/* Vant (≈300 KB of CSS plus its components) is only needed by these two forms, so it is
   registered here, in a lazily loaded chunk, instead of at startup. */
import { getCurrentInstance } from 'vue'
import { ActionSheet, Button, Cell, CellGroup, Field, NavBar, Tab, Tabs } from 'vant'
import 'vant/lib/index.css'

const app = getCurrentInstance()!.appContext.app as any
if (!app.__vantLegacy) {
  app.__vantLegacy = true
  ;[ActionSheet, Button, Cell, CellGroup, Field, NavBar, Tab, Tabs].forEach(c => app.use(c))
}
</script>

<style scoped>
.legacy {
  position: relative;
  width: 532px;
  height: 268px;
  overflow: hidden;
  text-transform: none;
  --van-primary-color: var(--o4);
  --van-background: #000;
  --van-background-2: var(--g1);
  --van-background-3: var(--g2);
  --van-background-4: var(--g3);
  --van-background-5: var(--g4);
  --van-text-color: var(--g6);
  --van-text-color-2: var(--g5);
  --van-text-color-3: var(--g4);
  --van-active-color: var(--g2);
  --van-border-color: #000;
  --van-cell-background: var(--g1);
  --van-cell-group-background: transparent;
  --van-cell-group-inset-radius: 0;
  --van-cell-font-size: 13px;
  --van-cell-vertical-padding: 7px;
  --van-nav-bar-background: transparent;
  --van-nav-bar-title-text-color: var(--ft);
  --van-nav-bar-icon-color: var(--fb);
  --van-tabs-nav-background: var(--g1);
  --van-tab-active-text-color: #000;
  --van-tab-text-color: var(--g5);
  --van-field-input-text-color: var(--c5);
  --van-field-label-color: var(--g5);
  --van-cell-text-color: var(--g6);
  --van-field-placeholder-text-color: var(--g3);
  --van-cell-group-title-color: var(--g5);
  --van-nav-bar-arrow-size: 16px;
  --van-nav-bar-height: 32px;
  --van-action-sheet-item-background: var(--g1);
  --van-font-family: var(--lfont);
  font-family: var(--lfont);
}
.legacy :deep(.van-nav-bar__title) { font-weight: 300; font-size: 18px; letter-spacing: .03em; }
.legacy :deep(.van-cell-group--inset) { margin: 0 0 6px; }
.legacy :deep(.van-cell) { border-left: 6px solid var(--fb); margin-bottom: 2px; }
.legacy :deep(.van-cell:after) { display: none; }
.legacy :deep(.van-tab--active) { background: var(--o4); }
.legacy :deep(.van-tabs__line) { display: none; }
.legacy :deep(.van-tabs__nav) { border-radius: 0; }
.legacy :deep(.page) { height: 268px; }
.legacy :deep(.content) { padding: 4px 2px; }
</style>
