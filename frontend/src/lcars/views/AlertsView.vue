<template>
  <!-- Alert log: every HMS condition the printer reports, worst first. The selected record
       carries its code and a scannable link to the manufacturer's fix procedure. -->
  <div ref="root" class="al">
    <div class="list lscroll stg" data-o="1">
      <div v-if="!items.length" class="none">
        <div class="none-t">{{ t('x.alert_none') }}</div>
      </div>
      <button
        v-for="m in items"
        :key="m.attr + '-' + m.code"
        type="button"
        class="rec"
        :class="[`lv${Math.min(3, hmsLevel(m))}`, { on: sel && sel.attr === m.attr && sel.code === m.code }]"
        @click="sel = m"
      >
        <span class="rec-sl"></span>
        <span class="rec-c">{{ hmsCode(m) }}</span>
        <span class="rec-t ell">{{ text(m) || (hmsTables ? '—' : t('x.alert_loading')) }}</span>
      </button>
    </div>

    <div class="det stg" data-o="2">
      <template v-if="sel">
        <canvas ref="qr" class="qr" width="104" height="104"></canvas>
        <div class="d-c num">{{ hmsCode(sel) }}</div>
        <div class="d-t">{{ text(sel) }}</div>
        <div class="d-u cap">{{ t('x.alert_scan') }}</div>
      </template>
      <div v-else class="cap">{{ t('x.alert_nosel') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DeviceHMS } from '@bambulab-p1screen/printer-api'
import { usePrinterStore } from '../../stores/printer'
import { hmsCode, hmsLevel, hmsTables, hmsText, hmsUrl, loadHms } from '../hms'

const { t, locale } = useI18n()
const { device } = usePrinterStore()
const root = ref<HTMLElement | null>(null)
const qr = ref<HTMLCanvasElement | null>(null)

const items = computed(() => [...(device.value?.hms ?? [])].sort((a, b) => hmsLevel(a) - hmsLevel(b)))
const sel = ref<DeviceHMS | null>(null)
watch(items, (list) => {
  if (!sel.value || !list.some(m => m.attr === sel.value!.attr && m.code === sel.value!.code)) sel.value = list[0] ?? null
}, { immediate: true })

const text = (m: DeviceHMS) => (hmsTables.value ? hmsText(m, locale.value) : '')

/* qrcode is only fetched when an alert is actually shown */
watch(sel, async (m) => {
  await nextTick()
  if (!m || !qr.value) return
  const QRCode = (await import('qrcode')).default
  if (sel.value !== m || !qr.value) return
  QRCode.toCanvas(qr.value, hmsUrl(m), { width: 104, margin: 1, color: { dark: '#000', light: '#FAE3C7' } }).catch(() => {})
}, { immediate: true, flush: 'post' })

onMounted(() => { loadHms() })
</script>

<style scoped>
.al { position: relative; width: calc(532px + var(--xw, 0px)); height: 268px; }
.list { position: absolute; left: 0; top: 0; width: calc(300px + var(--xw, 0px) * .6); height: 268px; }
.none { padding: 12px 4px; }
.none-t { font-size: 22px; font-weight: 300; color: var(--c4); }
.rec { position: relative; display: block; width: 100%; height: 44px; margin: 0 0 3px; border: 0; padding: 0; background: var(--g1); text-align: left; font-family: var(--lfont); cursor: pointer; outline: none; }
.rec:active { opacity: .72; }
.rec.on { background: var(--g2); }
.rec-sl { position: absolute; left: 0; top: 0; width: 8px; height: 44px; background: var(--y4); }
.lv1 .rec-sl { background: #FF3B24; }
.lv2 .rec-sl { background: var(--o3); }
.rec-c { position: absolute; left: 14px; top: 3px; font-size: 14px; color: var(--o5); letter-spacing: .06em; }
.rec-t { position: absolute; left: 14px; top: 21px; width: calc(278px + var(--xw, 0px) * .6); font-size: 13px; line-height: 17px; color: var(--g6); text-transform: none; }
.det { position: absolute; left: calc(312px + var(--xw, 0px) * .6); top: 0; width: calc(220px + var(--xw, 0px) * .4); height: 268px; }
.qr { display: block; width: 104px; height: 104px; image-rendering: pixelated; }
.d-c { margin-top: 8px; font-size: 18px; color: var(--o5); letter-spacing: .04em; }
.d-t { margin-top: 4px; font-size: 13px; line-height: 17px; text-transform: none; color: var(--g6); max-height: 96px; overflow: hidden; }
.d-u { margin-top: 6px; }
</style>
