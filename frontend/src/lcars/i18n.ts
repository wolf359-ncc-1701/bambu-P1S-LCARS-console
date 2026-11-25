/* Console text, one language at a time. English keeps the LCARS system names (`name`) with
   the plain printer part beside them (`fn`); Chinese says plainly what each thing is, so a
   Chinese `fn` that would repeat its `name` is not shown (see `same`). Only proper names
   (files, printers, filament brands) stay as they are. Merged into the app's i18n under `x`. */
const zh = {
  // shell
  nav_home: '主页', nav_control: '打印控制', nav_ams: 'AMS', nav_files: '文件', nav_settings: '设置',
  sec_home: '主页', sec_control: '打印机控制', sec_align: '运动控制', sec_ams: 'AMS 控制', sec_pattern: '编辑耗材',
  sec_files: '文件', sec_settings: '设置', sec_alerts: '告警记录',
  fn_home: '主页', fn_control: '打印机控制', fn_align: '运动控制', fn_ams: 'AMS 控制', fn_pattern: '编辑耗材',
  fn_files: '文件', fn_settings: '设置', fn_alerts: '告警',
  cond_none: '未连接', cond_green: '状态正常', cond_yellow: '需要注意', cond_red: '打印错误',
  auto_on: '自动 开', auto_idle: '自动 待机', auto_off: '自动 关',
  link_local: '局域网', link_cloud: '云端', no_link: '未连接打印机', link_down: '连接中断',
  boot_title: '拓竹打印屏', boot_font: '加载字体', boot_link: '建立连接', boot_ready: '系统就绪', boot_build: '版本',
  rotate_hint: '请横置设备',

  // systems (console name / function)
  core: '喷嘴', core_fn: '喷嘴', injector: '挤出机', injector_fn: '挤出机',
  pad: '热床', pad_fn: '热床', feed: '送料', feed_fn: '送料',
  coolant: '风扇', coolant_fn: '风扇', chamber: '仓温', chamber_fn: '仓温',
  warp: '打印速度', warp_fn: '打印速度', illum: '照明', emitter: '运动控制', emitter_fn: '运动控制',
  stores: 'AMS', stores_fn: 'AMS',

  // home
  standing_by: '空闲', no_link_t: '未连接', unnamed: '未命名任务', layer: '层', t_minus: '剩余', eta: '完成于',
  suspend: '暂停', resume: '继续', abort: '中止', skip: '跳过对象', establish: '添加设备',
  abort_title: '停止打印', abort_body: '确定要停止当前打印任务吗？此操作不可撤销。',
  diag_title: '状态巡检', diag_done: '巡检完成', zoom_title: '熔融沉积成型', zoom_layer: '层高', zoom_line: '线宽', zoom_now: '当前层',
  ready_thermal: '喷嘴 {n}° · 热床 {b}°', ready_ams: 'AMS 已装料 {n} 槽 · 湿度 {h} 级', ready_link: '打印机在线 · 信号 {s}%', ready_chamber: '仓温 {c}°',
  st_off: '离线', st_standby: '待机', st_nominal: '正常', st_caution: '注意', st_alert: '警报',

  // engineering
  m_thermal: '热端 · 热床', m_fans: '风扇', m_speed: '速度', m_chamber: '仓温', m_align: '移动', m_light: '照明',
  extrude: '挤出 10mm', retract: '回抽 10mm', core_cold: '喷嘴低于 170°，不能挤出',
  target: '目标', max: '上限', keypad: '键盘', off: '关闭', on: '开启', shutdown: '关闭',
  core_set: '喷嘴温度', pad_set: '热床温度', energy: '加热',
  nozzle_ss: '不锈钢', nozzle_hs: '硬化钢',
  fan_part: '部件风扇', fan_aux: '辅助风扇', fan_chamber: '机箱风扇',
  fan_part_d: '工具头前方 · 冷却刚挤出的耗材', fan_aux_d: '左侧壁 · 大风量侧吹', fan_chamber_d: '后壁 · 排出舱内热气',
  speed_idle: '空闲时不能调速，只能预览', warp_silent: '静音', warp_standard: '标准', warp_sport: '运动', warp_ludicrous: '狂暴',
  m_cool: '层间冷却时间', m_bond: '层间粘合', m_overhang: '悬垂成型', qualitative: '定性示意，非测量值',
  flow_hot: '热', flow_cold: '冷', preview: '预览', simulated: '示意动画', live: '当前', speed_idle_s: '仅打印中可调', live_engaged: '已生效',
  light_on: '照明已开', light_off: '照明已关',

  // align
  xy_plane: 'XY 基准面', z_plane: 'Z 正视面', iso_view: '总览',
  home_axes: '回原点', bed_up: '热床上升', bed_down: '热床下降', step: '步长',
  printing_lock: '打印中，禁止移动', estimated: '位置为估算值（回原点后校准）',
  view_top: '俯视', view_front: '正视',

  // chamber
  ch_heater: '仓温加热器', ch_now: '当前仓温', ch_heating: '加热中', ch_idle: '未加热', ch_stopped: '已停机',
  ch_mode_auto: '自动', ch_mode_manual: '手动', ch_start_t: '开始加热', ch_stop_t: '停止加热',
  ch_run: '开始工作', ch_halt: '停止工作', ch_heat_on: '开始加热', ch_heat_off: '停止加热',
  ch_timer: '定时', ch_timer_start: '分钟后开始', ch_timer_stop: '分钟后停止', ch_timer_none: '无定时',
  ch_timer_set: '设定定时', ch_timer_cancel: '取消定时', ch_timer_left: '剩余',
  ch_plan: '温度预约', ch_plan_none: '无预约', ch_plan_add: '新增预约', ch_plan_daily: '每天', ch_plan_once: '一次',
  ch_plan_at: '时间', ch_plan_temp: '目标', ch_plan_del: '删除',
  ch_offline: '无信号', ch_unset: '未配置加热器', ch_cfg: '在 设置 → 仓温 中填写设备 MAC',
  ch_local_note: '定时由本屏执行，请保持本屏运行',
  ch_confirm_halt: '确定要停止加热器工作吗？', ch_confirm_run: '确定要让加热器开始工作吗？',
  ch_hyst_err: '停止温度必须高于开始温度',
  ch_link: '仓温加热器', ch_mac: '设备 MAC', ch_broker: '服务器', ch_sim: '模拟器', ch_cloud: '欣易云',
  ch_save: '保存并连接', unit_min: '分钟', ch_hhmm: '时分 HHMM', ch_time_bad: '时间无效', ch_mac_bad: 'MAC 格式应为 8C:8C:29:00:00:00', ch_none: '—',

  // stores
  silos: 'AMS 料槽', no_ams: '无 AMS', aux_feed: '外挂料盘', empty: '空', env: 'AMS 环境', moisture: '湿度', thermal: '温度',
  desiccation: '烘干', dry_left: '烘干剩余', manifold: '汇流 → 挤出机',
  load: '进料', unload: '退料', rfid: '重读 RFID', edit: '编辑耗材', empty_slot: '空槽位',
  dry: '烘干', dry_unsupported: '此 AMS 不支持烘干', store_cfg: 'AMS 选项',
  dry_start: '开始烘干', dry_stop: '停止烘干', dry_rotate: '烘干时旋转料盘', duration: '时长', close: '关闭',
  cfg_insert: '插入料盘时读取', cfg_power: '开机时读取', cfg_remain: '估算剩余量', cfg_auto: '断料自动续料',
  feeding: '正在进料', unloading: '正在退料', scanning: '正在扫描',

  // pattern
  pattern_locked: 'RFID 锁定，只读', manufacturer: '品牌', material: '耗材', color: '颜色', thermal_range: '温度范围',
  purge: '清除', commit: '保存', back: '返回', custom: '自定义', silo: '槽位',

  // library
  records: '打印文件', on_file: '个文件', reindex: '刷新', lib_offline: '文件列表需要局域网连接',
  lib_empty: '打印机存储中没有可打印文件', accessing: '读取中', scanning_pattern: '读取预览',
  too_large: '文件太大，不读预览', no_preview: '无预览', select_record: '选择一个文件', size: '大小', plate: '盘',
  use_ams: '使用 AMS', bed_level: '热床调平', commence: '开始打印', print_title: '开始打印',
  print_body: '将在打印机上开始打印 {name}。请确认热床上没有物体。', commenced: '已开始打印',
  dir_root: '根目录', dir_cache: '缓存',

  // operations
  o_vessel: '设备', o_comms: '连接', o_soft: '固件', o_diag: '校准', o_proto: '打印选项', o_iface: '界面', o_chamber: '仓温',
  registry: '设备列表', register: '添加设备', edit_device: '编辑', status: '状态', channel: '通道', address: '地址',
  signal: '信号', storage: '存储卡', mounted: '已插入', unmounted: '未插入', relink: '重新连接',
  no_data: '无数据', cal_level: '热床调平', cal_res: '振动补偿', cal_motor: '电机降噪',
  cal_ready: '就绪', cal_busy: '打印机忙', cal_running: '进行中', cal_go: '开始校准',
  recovery: '丢步自动恢复', language: '语言', lang_auto: '跟随系统', build: '版本',
  k_dim: '闲置自动调暗', k_fx: '特效', k_fx_full: '完整', k_fx_low: '已降级（发热或卡顿）', k_batt: '电池', k_err: '页面错误',
  hc_core: '喷嘴', hc_pad: '热床', hc_bay: '仓温', hc_layer: '层', silhouette: '按缩略图轮廓估算',
  hide_bar: '横屏隐藏状态栏', land_lock: '强制横屏', awake: '保持亮屏', export: '导出设备信息', check_update: '检查更新',
  rev_available: '有新版本', sound: '提示音', sound_d: '按键、打印事件与警报的提示音，音量较低',
  linking: '正在连接', vessel_selected: '已切换设备',

  // alerts
  alert_none: '没有告警', alert_loading: '读取告警库', alert_scan: '扫码查看处理方法', alert_nosel: '未选择记录',
  alert_ack: '知道了', alert_log: '告警记录', red_alert: '警告', condition_red: '打印出错',

  // keypad / confirm / common
  range: '范围', del: '删除', set: '设定', cancel: '取消', confirm: '确认', done: '已执行', failed: '失败：{message}',
  sent: '已发送',
}

type Messages = typeof zh

const en: Messages = {
  nav_home: 'REPLICATION', nav_control: 'ENGINEERING', nav_ams: 'MATTER STORES', nav_files: 'LIBRARY', nav_settings: 'OPERATIONS',
  sec_home: 'REPLICATION BAY', sec_control: 'ENGINEERING', sec_align: 'EMITTER ALIGNMENT', sec_ams: 'MATTER STORES', sec_pattern: 'PATTERN BUFFER',
  sec_files: 'LIBRARY COMPUTER', sec_settings: 'OPERATIONS', sec_alerts: 'ALERT LOG',
  fn_home: 'HOME', fn_control: 'PRINTER CONTROL', fn_align: 'MOTION', fn_ams: 'AMS CONTROL', fn_pattern: 'EDIT FILAMENT',
  fn_files: 'FILES', fn_settings: 'SETTINGS', fn_alerts: 'ALERTS',
  cond_none: 'NO LINK', cond_green: 'CONDITION GREEN', cond_yellow: 'CONDITION YELLOW', cond_red: 'CONDITION RED',
  auto_on: 'AUTO • ON', auto_idle: 'AUTO • IDLE', auto_off: 'AUTO • OFF',
  link_local: 'LOCAL NET', link_cloud: 'SUBSPACE LINK', no_link: 'NO PRINTER LINKED', link_down: 'LINK LOST',
  boot_title: 'LCARS • REPLICATOR CONTROL', boot_font: 'LOADING TYPEFACE', boot_link: 'ESTABLISHING LINK', boot_ready: 'SYSTEMS READY', boot_build: 'BUILD',
  rotate_hint: 'TURN DEVICE SIDEWAYS',

  core: 'WARP CORE', core_fn: 'NOZZLE', injector: 'MATTER INJECTOR', injector_fn: 'EXTRUDER',
  pad: 'REPLICATION PAD', pad_fn: 'HEATBED', feed: 'MATTER FEED', feed_fn: 'FILAMENT',
  coolant: 'COOLANT', coolant_fn: 'FANS', chamber: 'BAY ATMOSPHERE', chamber_fn: 'CHAMBER',
  warp: 'WARP FACTOR', warp_fn: 'PRINT SPEED', illum: 'ILLUMINATION', emitter: 'EMITTER ALIGNMENT', emitter_fn: 'MOTION',
  stores: 'MATTER STORES', stores_fn: 'AMS',

  standing_by: 'STANDING BY', no_link_t: 'NO LINK', unnamed: 'UNNAMED PATTERN', layer: 'STRATUM', t_minus: 'T-MINUS', eta: 'ETA',
  suspend: 'SUSPEND', resume: 'RESUME', abort: 'ABORT', skip: 'SKIP OBJECT', establish: 'ESTABLISH LINK',
  abort_title: 'ABORT REPLICATION', abort_body: 'STOP THE CURRENT PRINT? THIS CANNOT BE UNDONE.',
  diag_title: 'LEVEL 3 DIAGNOSTIC', diag_done: 'DIAGNOSTIC COMPLETE', zoom_title: 'FUSED DEPOSITION', zoom_layer: 'LAYER', zoom_line: 'LINE', zoom_now: 'STRATUM',
  ready_thermal: 'THERMAL ENVELOPE • CORE {n}° • PAD {b}°', ready_ams: 'MATTER STORES • {n} SILOS CHARGED • MOISTURE LEVEL {h}', ready_link: 'LINK NOMINAL • SIGNAL {s}%', ready_chamber: 'BAY ATMOSPHERE • {c}°',
  st_off: 'OFF', st_standby: 'STANDBY', st_nominal: 'NOMINAL', st_caution: 'CAUTION', st_alert: 'ALERT',

  m_thermal: 'CORE • PAD', m_fans: 'COOLANT', m_speed: 'WARP', m_chamber: 'ATMOSPHERE', m_align: 'ALIGN', m_light: 'LIGHT',
  extrude: 'INJECT 10MM', retract: 'WITHDRAW 10MM', core_cold: 'CORE BELOW 170° • INJECTION LOCKED',
  target: 'TARGET', max: 'MAX', keypad: 'KEYPAD', off: 'OFF', on: 'ON', shutdown: 'SHUTDOWN',
  core_set: 'CORE TEMPERATURE', pad_set: 'PAD TEMPERATURE', energy: 'CORE POWER',
  nozzle_ss: 'STAINLESS', nozzle_hs: 'HARDENED',
  fan_part: 'PART COOLANT', fan_aux: 'AUX COOLANT', fan_chamber: 'BAY VENT',
  fan_part_d: 'TOOLHEAD FRONT • QUENCHES FRESH MATTER', fan_aux_d: 'LEFT BULKHEAD • HIGH-FLOW CROSSWIND', fan_chamber_d: 'AFT BULKHEAD • EXHAUSTS BAY HEAT',
  speed_idle: 'WARP CHANGES NEED AN ACTIVE PRINT • PREVIEW ONLY', warp_silent: 'SILENT', warp_standard: 'STANDARD', warp_sport: 'SPORT', warp_ludicrous: 'LUDICROUS',
  m_cool: 'INTERLAYER COOLING', m_bond: 'LAYER BOND', m_overhang: 'OVERHANG FORM', qualitative: 'QUALITATIVE • NOT MEASURED',
  flow_hot: 'HOT', flow_cold: 'COLD', preview: 'PREVIEW', simulated: 'SIMULATION', live: 'LIVE', speed_idle_s: 'ACTIVE PRINT ONLY', live_engaged: 'ENGAGED',
  light_on: 'ILLUMINATION ON', light_off: 'ILLUMINATION OFF',

  xy_plane: 'XY DATUM PLANE', z_plane: 'Z ELEVATION', iso_view: 'OVERVIEW',
  home_axes: 'ORIGIN', bed_up: 'PAD UP', bed_down: 'PAD DOWN', step: 'STEP',
  printing_lock: 'REPLICATION IN PROGRESS • MOTION LOCKED', estimated: 'POSITION ESTIMATED • HOME TO CALIBRATE',
  view_top: 'TOP', view_front: 'FRONT',

  ch_heater: 'BAY HEATER', ch_now: 'BAY TEMPERATURE', ch_heating: 'HEATING', ch_idle: 'IDLE', ch_stopped: 'HALTED',
  ch_mode_auto: 'AUTO', ch_mode_manual: 'MANUAL', ch_start_t: 'HEAT BELOW', ch_stop_t: 'STOP AT',
  ch_run: 'BRING ONLINE', ch_halt: 'TAKE OFFLINE', ch_heat_on: 'HEAT ON', ch_heat_off: 'HEAT OFF',
  ch_timer: 'TIMER', ch_timer_start: 'MIN • THEN START', ch_timer_stop: 'MIN • THEN STOP', ch_timer_none: 'NO TIMER',
  ch_timer_set: 'SET TIMER', ch_timer_cancel: 'CANCEL TIMER', ch_timer_left: 'LEFT',
  ch_plan: 'TEMPERATURE SCHEDULE', ch_plan_none: 'NO SCHEDULE', ch_plan_add: 'ADD ENTRY', ch_plan_daily: 'DAILY', ch_plan_once: 'ONCE',
  ch_plan_at: 'AT', ch_plan_temp: 'TARGET', ch_plan_del: 'DELETE',
  ch_offline: 'NO SIGNAL', ch_unset: 'NO HEATER LINKED', ch_cfg: 'SET THE DEVICE MAC IN OPERATIONS → ATMOSPHERE',
  ch_local_note: 'TIMERS RUN ON THIS SCREEN • KEEP IT ON',
  ch_confirm_halt: 'TAKE THE BAY HEATER OFFLINE?', ch_confirm_run: 'BRING THE BAY HEATER ONLINE?',
  ch_hyst_err: 'STOP TEMPERATURE MUST BE ABOVE START',
  ch_link: 'BAY HEATER', ch_mac: 'DEVICE MAC', ch_broker: 'SERVER', ch_sim: 'SIMULATOR', ch_cloud: 'SINILINK',
  ch_save: 'SAVE AND LINK', unit_min: 'MIN', ch_hhmm: 'HHMM', ch_time_bad: 'INVALID TIME', ch_mac_bad: 'MAC FORMAT: 8C:8C:29:00:00:00', ch_none: '—',

  silos: 'MATTER SILOS', no_ams: 'NO AMS', aux_feed: 'AUX FEED', empty: 'EMPTY', env: 'ENVIRONMENT', moisture: 'MOISTURE', thermal: 'THERMAL',
  desiccation: 'DESICCATION', dry_left: 'REMAINING', manifold: 'MANIFOLD → INJECTOR',
  load: 'INJECT', unload: 'WITHDRAW', rfid: 'SCAN SIGNATURE', edit: 'PATTERN', empty_slot: 'EMPTY SILO',
  dry: 'DESICCATION', dry_unsupported: 'NO DESICCATOR', store_cfg: 'STORE CONFIG',
  dry_start: 'COMMENCE', dry_stop: 'TERMINATE CYCLE', dry_rotate: 'ROTATE SILOS', duration: 'DURATION', close: 'CLOSE',
  cfg_insert: 'SCAN ON INSERTION', cfg_power: 'SCAN ON POWER-UP', cfg_remain: 'RESERVE ESTIMATION', cfg_auto: 'AUTO RESUPPLY',
  feeding: 'INJECTING', unloading: 'WITHDRAWING', scanning: 'SIGNATURE SCAN',

  pattern_locked: 'SIGNATURE LOCKED • RFID', manufacturer: 'SOURCE', material: 'PATTERN', color: 'SPECTRUM', thermal_range: 'THERMAL RANGE',
  purge: 'PURGE', commit: 'COMMIT', back: 'STORES', custom: 'CUSTOM', silo: 'SILO',

  records: 'PATTERN RECORDS', on_file: 'ON FILE', reindex: 'RE-INDEX', lib_offline: 'LIBRARY ACCESS NEEDS A LOCAL NET LINK',
  lib_empty: 'NO PATTERNS ON FILE', accessing: 'ACCESSING LIBRARY', scanning_pattern: 'SCANNING PATTERN',
  too_large: 'PATTERN TOO LARGE TO SCAN', no_preview: 'NO PREVIEW', select_record: 'SELECT A RECORD', size: 'SIZE', plate: 'PLATE',
  use_ams: 'AMS FEED', bed_level: 'PAD SURVEY', commence: 'COMMENCE REPLICATION', print_title: 'COMMENCE REPLICATION',
  print_body: 'START PRINTING {name}? MAKE SURE THE PAD IS CLEAR.', commenced: 'REPLICATION COMMENCED',
  dir_root: 'ROOT', dir_cache: 'CACHE',

  o_vessel: 'VESSEL', o_comms: 'COMMS', o_soft: 'SOFTWARE', o_diag: 'DIAGNOSTIC', o_proto: 'PROTOCOLS', o_iface: 'INTERFACE', o_chamber: 'ATMOSPHERE',
  registry: 'VESSEL REGISTRY', register: 'REGISTER VESSEL', edit_device: 'EDIT', status: 'STATUS', channel: 'CHANNEL', address: 'ADDRESS',
  signal: 'SIGNAL', storage: 'DATA STORE', mounted: 'MOUNTED', unmounted: 'NOT MOUNTED', relink: 'RE-ESTABLISH LINK',
  no_data: 'NO DATA', cal_level: 'PAD SURVEY', cal_res: 'RESONANCE SWEEP', cal_motor: 'MOTOR NOISE',
  cal_ready: 'READY', cal_busy: 'BAY OCCUPIED', cal_running: 'IN PROGRESS', cal_go: 'COMMENCE DIAGNOSTIC',
  recovery: 'STEP-LOSS RECOVERY', language: 'LANGUAGE', lang_auto: 'SYSTEM', build: 'BUILD',
  k_dim: 'IDLE DIMMING', k_fx: 'EFFECTS', k_fx_full: 'FULL', k_fx_low: 'REDUCED • HEAT OR LOAD', k_batt: 'CELL', k_err: 'FAULTS',
  hc_core: 'CORE', hc_pad: 'PAD', hc_bay: 'BAY', hc_layer: 'STRATUM', silhouette: 'SILHOUETTE EST.',
  hide_bar: 'STATUS BAR SUPPRESSION', land_lock: 'LANDSCAPE LOCK', awake: 'DISPLAY PERSISTENCE', export: 'EXPORT TELEMETRY', check_update: 'CHECK REVISION',
  rev_available: 'REVISION AVAILABLE', sound: 'AUDIO', sound_d: 'CONSOLE TONES FOR PRESSES, PRINT EVENTS AND ALERTS',
  linking: 'LINKING', vessel_selected: 'VESSEL SELECTED',

  alert_none: 'NO ALERT CONDITIONS', alert_loading: 'LOADING DATABASE', alert_scan: 'SCAN FOR THE FIX', alert_nosel: 'NO RECORD SELECTED',
  alert_ack: 'ACKNOWLEDGE', alert_log: 'ALERT LOG', red_alert: 'ALERT', condition_red: 'CONDITION: RED',

  range: 'RANGE', del: 'DEL', set: 'SET', cancel: 'CANCEL', confirm: 'CONFIRM', done: 'DONE', failed: 'FAILED: {message}',
  sent: 'SENT',
}

export const lcarsMessages = { zh: { x: zh }, en: { x: en } }

/* Chinese names already say what the part is; its `fn` caption would only repeat it. */
export const same = (a: string, b: string) => a.trim() === b.trim()
