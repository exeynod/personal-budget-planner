// poster-screens.jsx — Maximal Poster screens for TG Budget prototype
// Each screen is a single colored poster. Big display type, asymmetric.

const POSTER = {
  cream:    '#F4EAD9',
  ink:      '#1B1A18',
  yellow:   '#FFE76E',
  coral:    '#FF5A3C',
  cobalt:   '#1B2A6B',
  red:      '#C24A2A',
  black:    '#0E0E0E',
  paper:    '#FFF6E8',
};

// Mock data
const POSTER_DATA = {
  balance: 142380,
  plan:    85500,
  fact:    64330,
  surplus: 21170,
  daysLeft: 23,
  cats: [
    { id:'food',    name:'ПРОДУКТЫ',   act:22150, plan:30000, n:'01', rollover:'misc' },
    { id:'cafe',    name:'КАФЕ',       act:14820, plan:12000, n:'02', over:true, rollover:'misc' },
    { id:'home',    name:'ДОМ',        act:12300, plan:15000, n:'03', rollover:'savings' },
    { id:'transit', name:'ТРАНСПОРТ',  act: 5640, plan: 8000, n:'04', rollover:'misc' },
    { id:'fun',     name:'РАЗВЛЕЧ.',   act: 2230, plan: 6000, n:'05', rollover:'misc' },
    { id:'gifts',   name:'ПОДАРКИ',    act: 1200, plan: 4000, n:'06', rollover:'savings' },
    { id:'health',  name:'ЗДОРОВЬЕ',   act: 2400, plan: 7000, n:'07', rollover:'savings' },
    { id:'subs',    name:'ПОДПИСКИ',   act: 3500, plan: 3500, n:'08', rollover:'misc' },
  ],
  accounts: [
    { id:'tink',  bank:'Т-БАНК',     mask:'·· 4408', bal:  84320, kind:'card',   primary:true },
    { id:'sber',  bank:'СБЕР',       mask:'·· 1290', bal:  42180, kind:'card' },
    { id:'cash',  bank:'НАЛИЧНЫЕ',   mask:'',        bal:  12880, kind:'cash' },
    { id:'tink2', bank:'Т-БАНК',     mask:'НАКОП.',  bal:   3000, kind:'savings' },
  ],
  savings: {
    total: 47820,
    monthIn: 3120,
    roundup: { on:true, base:50, mtd: 1240 },
    goals: [
      { id:'g1', name:'Отпуск · Грузия',  target:120000, cur: 38400, due:'август' },
      { id:'g2', name:'Подушка · 3 мес.', target:300000, cur:  9420, due:'нет срока' },
    ],
  },
  txnsByDay: [
    { d:'Сегодня',  s:-3000,
      rows: [
        { t:'14:32', n:'Surf Coffee', cat:'кафе',      a:-480,  acc:'tink' },
        { t:'11:08', n:'Яндекс Go',   cat:'транспорт', a:-340,  acc:'tink' },
        { t:'09:14', n:'Вкусвилл',    cat:'продукты',  a:-2180, acc:'sber' },
      ]},
    { d:'Вчера',    s:-5529,
      rows: [
        { t:'21:40', n:'Probka',      cat:'кафе',       a:-3850, acc:'tink' },
        { t:'20:00', n:'Округление',  cat:'накопления', a:-50,   acc:'tink', kind:'roundup' },
        { t:'19:22', n:'Каро',        cat:'развлеч.',   a:-780,  acc:'tink' },
        { t:'12:00', n:'Spotify',     cat:'подписки',   a:-899,  acc:'sber' },
      ]},
    { d:'7 мая',    s:-3420,
      rows: [
        { t:'18:45', n:'Перекрёсток', cat:'продукты',   a:-3420, acc:'sber' },
        { t:'10:00', n:'В копилку · Грузия', cat:'накопления', a:-2000, acc:'tink', kind:'deposit' },
      ]},
    { d:'5 мая',    s:-1620,
      rows: [
        { t:'09:48', n:'Doubleby',    cat:'кафе',       a:-390,  acc:'tink' },
        { t:'14:22', n:'Bonch',       cat:'кафе',       a:-620,  acc:'cash' },
        { t:'19:00', n:'Yandex Lavka',cat:'продукты',   a:-610,  acc:'sber' },
      ]},
  ],
};

// ─────────────── tabbar ───────────────
function PosterTabBar({ active, dark, onTab, onFab }) {
  const tabs = [
    { id:'home',     l:'ГЛАВНАЯ' },
    { id:'savings',  l:'КОПИЛКА' },
    { id:'fab',      fab:true },
    { id:'ai',       l:'AI' },
    { id:'mgmt',     l:'УПР.' },
  ];
  const inkActive = dark ? POSTER.yellow : POSTER.ink;
  const inkMuted  = dark ? 'rgba(255,246,232,0.55)' : 'rgba(27,26,24,0.45)';
  const bg        = dark ? POSTER.black : POSTER.paper;
  const border    = dark ? '1px solid rgba(255,246,232,0.15)' : '1px solid rgba(27,26,24,0.12)';
  // index of active among 5 columns: home(0), savings(1), fab(2), ai(3), mgmt(4)
  const idxMap = { home:0, savings:1, ai:3, mgmt:4 };
  const activeIdx = idxMap[active];
  return (
    <div style={{ position:'absolute', left:0, right:0, bottom:0, zIndex:200 }}>
      <div style={{
        margin:'0 14px 18px', borderRadius:0, background:bg, border,
        display:'grid', gridTemplateColumns:'1fr 1fr 64px 1fr 1fr',
        alignItems:'center', height:68, position:'relative',
        boxShadow:'0 12px 30px rgba(0,0,0,0.45)',
      }}>
        {/* sliding active indicator */}
        {activeIdx != null && (
          <div style={{
            position:'absolute', bottom:0, height:2, background:inkActive,
            left:`calc(${activeIdx} * (100% / 5))`,
            width:'calc(100% / 5)',
            transition:'left .35s cubic-bezier(0.32,0.72,0,1), background .2s',
          }}/>
        )}
        {tabs.map(t => {
          if (t.fab) {
            return (
              <div key="fab" onClick={onFab} style={{
                display:'flex', justifyContent:'center', cursor:'pointer',
              }}>
                <div className="poster-fab" style={{
                  width:48, height:48, background:POSTER.yellow, color:POSTER.ink,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontFamily:'Archivo Black', fontSize:24, lineHeight:1,
                  boxShadow:'0 6px 16px rgba(255,231,110,0.35)',
                  transition:'transform .25s cubic-bezier(0.34,1.56,0.64,1)', userSelect:'none',
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.88) rotate(-90deg)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1) rotate(0)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1) rotate(0)'}
                >+</div>
              </div>
            );
          }
          const a = active === t.id;
          const glyph = { home:'■', savings:'◊', ai:'✦', mgmt:'⌘' }[t.id];
          return (
            <div key={t.id} onClick={() => onTab(t.id)} style={{
              cursor:'pointer', textAlign:'center',
              display:'flex', flexDirection:'column', alignItems:'center', gap:2,
              fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em',
              color: a ? inkActive : inkMuted,
              padding:'4px 0', transition:'color .25s',
            }}>
              <span style={{
                fontSize:13, lineHeight:1, opacity: a ? 1 : 0.8,
                display:'inline-block',
                animation: a ? 'posterTabPop 0.45s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
              }}>{glyph}</span>
              <span>{t.l}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────── eyebrow + bigfig helpers ───────────────
function Eye({ children, style }) {
  return <div style={{
    fontFamily:'JetBrains Mono', fontSize:11, fontWeight:600,
    letterSpacing:'0.18em', textTransform:'uppercase', opacity:0.7,
    ...style,
  }}>{children}</div>;
}
// animated count-up — pretty-prints with thin spaces, eases out
function useCountUp(target, dur=900) {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    let raf, start;
    const t0 = typeof target === 'number' ? target : parseFloat(String(target).replace(/\s/g,'')) || 0;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(t0 * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}
function CountUp({ value, dur=900 }) {
  const v = useCountUp(value, dur);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
}
function BigFig({ children, sup, color, size=90, style }) {
  return (
    <div style={{
      fontFamily:'JetBrains Mono', fontSize:size, fontWeight:400,
      lineHeight:0.92, letterSpacing:'-0.04em', color, whiteSpace:'nowrap',
      ...style,
    }}>{children}{sup && <sup style={{ fontSize:size*0.36, verticalAlign:'top', opacity:0.7, marginLeft:8 }}>{sup}</sup>}</div>
  );
}
function Mass({ children, italic, size=88, style }) {
  return <div style={{
    fontFamily: italic ? 'DM Serif Display' : 'Archivo Black',
    fontStyle: italic ? 'italic' : 'normal',
    fontWeight: italic ? 400 : 'normal',
    fontSize:size, lineHeight:0.85, letterSpacing:'-0.04em',
    textTransform: italic ? 'none' : 'uppercase', ...style,
  }}>{children}</div>;
}

// ─────────────── HOME ───────────────
function PosterHome({ accent, homeColor, onCat, onMgmt, onPlan, onTxn, onAccounts }) {
  const D = POSTER_DATA;
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const bg = homeColor === 'cobalt' ? POSTER.cobalt :
             homeColor === 'cream'  ? POSTER.cream  : POSTER.coral;
  const dark = homeColor !== 'cream';
  const fg = dark ? POSTER.paper : POSTER.ink;
  const daily = Math.max(0, Math.round((D.plan - D.fact) / Math.max(1, D.daysLeft)));
  const highlight = D.fact <= D.plan;
  const sortedCats = [...D.cats].sort((a,b) => (b.act/b.plan) - (a.act/a.plan));
  return (
    <div style={{ position:'absolute', inset:0, background:bg, color:fg, padding:'56px 22px 90px', overflow:'auto', fontFamily:'Manrope' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <Eye style={{ color:fg }}>VOL.04 / MAY 2026 · {D.daysLeft} ДНЯ</Eye>
        <div onClick={onMgmt} style={{ cursor:'pointer', fontFamily:'JetBrains Mono', fontSize:11, opacity:0.7, fontWeight:600, letterSpacing:'0.06em' }}>МЕНЮ ↗</div>
      </div>

      <div style={{ marginTop:6, lineHeight:1.05 }}>
        <Mass italic size={28} style={{ color:fg, opacity:0.75 }}>Дневной темп —</Mass>
      </div>

      <div style={{ marginTop:14 }}>
        <BigFig sup="₽" color={fg} size={88}><CountUp value={daily}/></BigFig>
        <div style={{ marginTop:6, fontFamily:'JetBrains Mono', fontSize:11, opacity:0.7, letterSpacing:'0.06em' }}>
          · осталось {D.daysLeft} дней · <span onClick={onAccounts} style={{ cursor:'pointer', borderBottom:`1px dashed ${dark ? 'rgba(255,246,232,0.4)' : 'rgba(27,26,24,0.35)'}` }}>в кошельке {fmt(D.balance)} ₽ →</span>
        </div>
      </div>

      <div onClick={onPlan} style={{
        marginTop:14, padding:'10px 12px',
        background: dark ? 'rgba(0,0,0,0.22)' : 'rgba(27,26,24,0.08)',
        color: fg, display:'flex', alignItems:'center', justifyContent:'space-between',
        cursor:'pointer', gap:10,
      }}>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.14em', opacity:0.7, textTransform:'uppercase' }}>
          PLAN МАЯ
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'JetBrains Mono', fontSize:13, fontWeight:600, color: highlight ? (dark ? POSTER.yellow : POSTER.cobalt) : POSTER.red, whiteSpace:'nowrap' }}>
            {highlight ? '+ ' : '− '}{fmt(D.surplus)} ₽
          </span>
          <span style={{ fontFamily:'JetBrains Mono', fontSize:14, opacity:0.55 }}>›</span>
        </span>
      </div>

      <div style={{ marginTop:22 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
          <Eye style={{ color:fg }}>КАТЕГОРИИ</Eye>
          <span onClick={onTxn} style={{ cursor:'pointer', fontFamily:'JetBrains Mono', fontSize:11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:fg, opacity:0.7, borderBottom:`1px dashed ${dark ? 'rgba(255,246,232,0.4)' : 'rgba(27,26,24,0.35)'}` }}>ВСЕ ОПЕРАЦИИ →</span>
        </div>
        {sortedCats.map((c, i) => {
          const pct = Math.round(c.act/c.plan*100);
          const barPct = Math.min(100, pct);
          const barColor = c.over ? (dark ? POSTER.yellow : POSTER.red) : fg;
          return (
            <div key={c.id} onClick={() => onCat(c.id)} style={{
              padding:'10px 0', borderTop: dark ? '1px solid rgba(255,246,232,0.22)' : '1px solid rgba(27,26,24,0.18)',
              cursor:'pointer',
              opacity:0,
              animation:`posterRowIn 0.45s cubic-bezier(0.22,0.61,0.36,1) ${0.08 + i*0.045}s forwards`,
            }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto 14px', gap:10, alignItems:'baseline', fontSize:13, fontWeight:700 }}>
                <span style={{ display:'flex', alignItems:'baseline', gap:10, minWidth:0 }}>
                  <span style={{ opacity:0.5, fontSize:11, fontFamily:'JetBrains Mono', fontWeight:600, letterSpacing:'0.08em' }}>{c.n}</span>
                  <span style={{ letterSpacing:'0.04em' }}>{c.name}</span>
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {c.over && (
                    <span style={{
                      fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em',
                      padding:'3px 6px',
                      background: dark ? POSTER.paper : POSTER.ink,
                      color: dark ? POSTER.ink : POSTER.paper,
                    }}>OVER</span>
                  )}
                  <span style={{ fontFamily:'JetBrains Mono' }}>{pct}%</span>
                </span>
                <span style={{ fontFamily:'JetBrains Mono', fontSize:13, opacity:0.5, textAlign:'right' }}>›</span>
              </div>
              <div style={{ marginTop:6, height:3, background: dark ? 'rgba(255,246,232,0.15)' : 'rgba(27,26,24,0.12)', position:'relative', overflow:'hidden' }}>
                <div style={{
                  position:'absolute', left:0, top:0, bottom:0, width:`${barPct}%`, background:barColor,
                  transformOrigin:'left center', transform:'scaleX(0)',
                  animation:`posterBarFill 0.7s cubic-bezier(0.22,0.61,0.36,1) ${0.18 + i*0.05}s forwards`,
                }}/>
                {c.over && <div style={{ position:'absolute', left: `${100*c.plan/c.act}%`, top:-2, bottom:-2, width:1, background:fg, opacity:0.6 }}/>}
              </div>
              <div style={{ marginTop:4, fontFamily:'JetBrains Mono', fontSize:11, opacity:0.6, display:'flex', justifyContent:'space-between' }}>
                <span>{fmt(c.act)} ₽</span>
                <span>из {fmt(c.plan)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function Stat({ l, v, fg, highlight, bg, ink }) {
  return (
    <div style={{
      padding:'10px 12px',
      background: highlight ? bg : (fg === POSTER.ink ? 'rgba(27,26,24,0.10)' : 'rgba(0,0,0,0.18)'),
      color: highlight ? ink : fg,
    }}>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', opacity:0.8 }}>{l}</div>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:18, fontWeight:600, marginTop:2, whiteSpace:'nowrap' }}>{v}</div>
    </div>
  );
}

// ─────────────── TXN REGISTER ───────────────
function PosterTxn({ filter, setFilter }) {
  const D = POSTER_DATA;
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const FILTERS = ['Все','Кафе','Продукты','Транспорт','Подписки','Копилка'];
  const matches = (cat) => {
    if (filter === 'Все') return true;
    if (filter === 'Копилка') return cat === 'накопления';
    return cat.toLowerCase().startsWith(filter.toLowerCase().slice(0,4));
  };
  const accLabel = id => ({ tink:'Т-БАНК', sber:'СБЕР', cash:'НАЛИЧНЫЕ', tink2:'НАКОП.' }[id] || '');
  const visible = D.txnsByDay.map(day => {
    const rows = day.rows.filter(r => matches(r.cat));
    return { ...day, rows, s: rows.reduce((s,r) => s+r.a, 0) };
  }).filter(d => d.rows.length > 0);
  const total = visible.reduce((s,d) => s + d.s, 0);
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.cobalt, color:POSTER.paper, padding:'56px 22px 90px', overflow:'auto', fontFamily:'Manrope' }}>
      <Eye>SECTION II</Eye>
      <Mass italic size={70} style={{ marginTop:6 }}>Реестр.</Mass>
      <Eye style={{ marginTop:4, opacity:0.6 }}>{visible.reduce((s,d) => s+d.rows.length, 0)} ЗАПИСЕЙ · {fmt(total)} ₽</Eye>

      <div style={{ display:'flex', gap:6, marginTop:18, flexWrap:'wrap' }}>
        {FILTERS.map(f => (
          <span key={f} onClick={() => setFilter(f)} style={{
            padding:'6px 10px', fontSize:11, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase',
            border:`1px solid ${filter===f ? POSTER.yellow : 'rgba(255,246,232,0.35)'}`,
            background: filter===f ? POSTER.yellow : 'transparent',
            color: filter===f ? POSTER.cobalt : POSTER.paper, cursor:'pointer',
          }}>{f}</span>
        ))}
      </div>

      {visible.length === 0 && (
        <div style={{ marginTop:40, fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:24, opacity:0.55 }}>
          Ничего не найдено в фильтре «{filter}».
        </div>
      )}

      {visible.map((day, i) => (
        <div key={i} style={{ marginTop:22, opacity:0, animation:`posterRowIn .45s cubic-bezier(0.22,0.61,0.36,1) ${0.05 + i*0.07}s forwards` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
            <div style={{ fontFamily:'DM Serif Display', fontSize:28, letterSpacing:'-0.02em', fontStyle:'italic' }}>{day.d}</div>
            <div style={{ fontFamily:'JetBrains Mono', fontSize:12, opacity:0.6 }}>{fmt(day.s)} ₽</div>
          </div>
          {day.rows.map((r, j) => {
            const isSav = r.cat === 'накопления';
            return (
              <div key={j} style={{
                display:'grid', gridTemplateColumns:'52px 1fr auto', gap:10,
                padding:'12px 0', borderTop:'1px solid rgba(255,246,232,0.18)', alignItems:'baseline',
              }}>
                <span style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55 }}>{r.t}</span>
                <span style={{ fontSize:14, fontWeight:600 }}>
                  {r.n}
                  <small style={{ display:'flex', flexWrap:'wrap', gap:6, fontWeight:400, fontSize:11, opacity:0.7, marginTop:3, letterSpacing:'0.06em', textTransform:'uppercase' }}>
                    <span>{r.cat}</span>
                    {r.acc && <span style={{ opacity:0.55 }}>· {accLabel(r.acc)}</span>}
                    {isSav && <span style={{ padding:'1px 5px', background:POSTER.yellow, color:POSTER.cobalt, letterSpacing:'0.14em', fontFamily:'Archivo Black' }}>{r.kind === 'roundup' ? '↻ ОКРУГЛ.' : '→ КОПИЛКА'}</span>}
                  </small>
                </span>
                <span style={{ fontFamily:'JetBrains Mono', fontSize:16, fontWeight:600, whiteSpace:'nowrap', color: isSav ? POSTER.yellow : POSTER.paper }}>{fmt(r.a)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─────────────── AI ───────────────
function PosterAi({ onSend }) {
  const D = POSTER_DATA;
  const [msgs, setMsgs] = React.useState([]);
  const [draft, setDraft] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, typing]);

  const guess = (text) => {
    const t = text.toLowerCase();
    if (t.includes('ед') || t.includes('продукт') || t.includes('кафе')) return 'На еду в мае: 22 150 ₽ (продукты), 14 820 ₽ (кафе). Итого 36 970 ₽ — 88% их месячного плана.';
    if (t.includes('кофе') || t.includes('запиши')) return 'Записал: Кофе 350 ₽ в Кафе. Новый факт по Кафе: 15 170 ₽ — превышение лимита на 26%.';
    if (t.includes('больше') || t.includes('топ')) return 'Топ-3: Продукты (22 150), Кафе (14 820, +23% к лимиту), Дом (12 300).';
    if (t.includes('шаблон') || t.includes('отпуск')) return 'Шаблон «Отпуск»: перелёт 40 000, отель 60 000, еда 20 000, прочее 10 000. Итого 130 000 ₽ — применить с июня?';
    return `По плану сэкономлено ${21170} ₽. До 1 июня — 23 дня.`;
  };

  const send = (text) => {
    const v = (text ?? draft).trim();
    if (!v) return;
    setMsgs(m => [...m, { role:'user', text:v }]);
    setDraft('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs(m => [...m, { role:'ai', text:guess(v) }]);
    }, 800);
  };

  const suggestions = [
    'Сколько я потратил на еду?',
    'Запиши: кофе 350 ₽',
    'На что трачу больше всего?',
    'Шаблон на отпуск',
  ];

  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.cream, color:POSTER.ink, padding:'56px 22px 90px', overflow:'hidden', fontFamily:'Manrope', display:'flex', flexDirection:'column' }}>
      <Eye style={{ color:POSTER.ink, opacity:0.5 }}>AI · ASSISTANT / ONLINE</Eye>

      {msgs.length === 0 ? (
        <>
          <div style={{ fontFamily:'DM Serif Display', fontSize:36, lineHeight:1.05, letterSpacing:'-0.02em', margin:'18px 0 8px' }}>
            «Май в плюсе на&nbsp;<em style={{ fontStyle:'italic', color:POSTER.red }}>21 170 ₽</em>.»
          </div>
          <div style={{ fontFamily:'DM Serif Display', fontSize:24, fontStyle:'italic', lineHeight:1.15, letterSpacing:'-0.01em', margin:'0 0 14px', opacity:0.78 }}>
            Кафе уже&nbsp;<em style={{ color:POSTER.red, fontStyle:'italic' }}>+23%</em> к&nbsp;лимиту&nbsp;— стоит притормозить.
          </div>
          <Eye style={{ color:POSTER.ink, opacity:0.55 }}>— из ваших данных, 9 мая</Eye>

          <div style={{ marginTop:28, flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:2 }}>
              <Eye style={{ color:POSTER.ink, opacity:0.55 }}>ПОДСКАЗКИ · ТАПНИ</Eye>
              <span style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.45 }}>{suggestions.length}</span>
            </div>
            {suggestions.map((s, i) => (
              <div key={i} onClick={() => send(s)} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'16px 0', borderTop:'1px solid rgba(27,26,24,0.18)',
                borderBottom: i===suggestions.length-1 ? '1px solid rgba(27,26,24,0.18)' : 'none',
                fontFamily:'DM Serif Display', fontSize:18, fontStyle:'italic', cursor:'pointer',
                opacity:0, animation:`posterRowIn .42s cubic-bezier(0.22,0.61,0.36,1) ${0.18 + i*0.08}s forwards`,
              }}>
                <span>{s}</span>
                <span style={{ fontFamily:'JetBrains Mono', fontSize:14, fontStyle:'normal' }}>→</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div ref={scrollRef} style={{ flex:1, overflowY:'auto', marginTop:18, paddingBottom:8, display:'flex', flexDirection:'column', gap:10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth:'86%',
              padding:'12px 14px',
              background: m.role === 'user' ? POSTER.ink : 'transparent',
              color:     m.role === 'user' ? POSTER.cream : POSTER.ink,
              border:    m.role === 'ai'   ? '1px solid rgba(27,26,24,0.25)' : 'none',
              fontFamily: m.role === 'ai' ? 'DM Serif Display' : 'Manrope',
              fontStyle: m.role === 'ai' ? 'italic' : 'normal',
              fontSize: m.role === 'ai' ? 17 : 13,
              fontWeight: m.role === 'user' ? 600 : 400,
              lineHeight:1.4,
            }}>{m.text}</div>
          ))}
          {typing && (
            <div style={{ alignSelf:'flex-start', padding:'12px 14px', border:'1px solid rgba(27,26,24,0.25)', display:'flex', gap:5 }}>
              {[0,1,2].map(i => (
                <span key={i} style={{
                  width:6, height:6, borderRadius:3, background:POSTER.ink,
                  animation:`posterDot 1.2s ease-in-out ${i*0.18}s infinite`,
                }}/>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop:14, padding:'14px 16px', background:POSTER.ink, color:POSTER.cream, display:'flex', alignItems:'center', gap:10 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="напишите или тапните подсказку…"
          style={{
            flex:1, background:'transparent', border:'none', outline:'none',
            color:POSTER.cream, fontFamily:'JetBrains Mono', fontSize:12,
            letterSpacing:'0.06em', opacity: draft ? 1 : 0.55,
          }}
        />
        <div onClick={() => send()} style={{
          fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em',
          background:POSTER.yellow, color:POSTER.ink, padding:'6px 10px', cursor:'pointer',
        }}>↵ ОТПРАВИТЬ</div>
      </div>
    </div>
  );
}

// ─────────────── CATEGORY DETAIL ───────────────
function PosterCategory({ catId, onBack }) {
  const D = POSTER_DATA;
  const cat = D.cats.find(c => c.id === catId) || D.cats[1];
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const pct = Math.round(cat.act / cat.plan * 100);
  const over = cat.act > cat.plan;
  const left = cat.plan - cat.act;
  const bg = over ? POSTER.red : POSTER.cobalt;
  const catKey = cat.name.toLowerCase().slice(0,4);
  // Pull real txns from registry
  const txns = D.txnsByDay.flatMap(day =>
    day.rows.filter(r => r.cat.toLowerCase().startsWith(catKey)).map(r => ({ d: day.d, ...r }))
  );
  const rollLabel = (cat.rollover === 'savings') ? '→ НАКОПЛЕНИЯ' : '→ ПРОЧЕЕ';
  return (
    <div style={{ position:'absolute', inset:0, background:bg, color:POSTER.paper, padding:'56px 22px 90px', overflow:'auto', fontFamily:'Manrope' }}>
      <div onClick={onBack} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:8 }}>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:14 }}>←</span>
        <Eye style={{ color:POSTER.paper, opacity:0.7 }}>{over ? 'OVERDRAFT' : 'IN PLAN'} · CAT</Eye>
      </div>
      <Mass size={68} style={{ marginTop:4, color:POSTER.paper, animation:'posterRiseIn .55s cubic-bezier(0.22,0.61,0.36,1) both' }}>{cat.name}</Mass>
      <div style={{ fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:20, marginTop:6, opacity:0.9, animation:'posterRiseIn .55s cubic-bezier(0.22,0.61,0.36,1) .08s both' }}>
        {over ? `— превышено на ${pct-100}%` : `— на ${pct}% плана`}
      </div>

      <div style={{ marginTop:22, animation:'posterRiseIn .6s cubic-bezier(0.22,0.61,0.36,1) .14s both' }}>
        <BigFig sup="₽" color={POSTER.paper} size={64}><CountUp value={cat.act} dur={1100}/></BigFig>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:12, opacity:0.7, marginTop:4, letterSpacing:'0.06em' }}>
          из {fmt(cat.plan)} ₽ · {over ? `−${fmt(cat.act-cat.plan)} over` : `${fmt(cat.plan-cat.act)} осталось`}
        </div>
      </div>

      <div style={{ marginTop:18, height:6, background:'rgba(255,246,232,0.2)', position:'relative', overflow:'hidden' }}>
        <div style={{
          position:'absolute', top:0, bottom:0, left:0, background:POSTER.yellow,
          width: over ? '100%' : `${pct}%`,
          transformOrigin:'left center', transform:'scaleX(0)',
          animation:'posterBarFill .85s cubic-bezier(0.22,0.61,0.36,1) .25s forwards',
        }}/>
        {over && <div style={{ position:'absolute', left:'81%', top:-3, bottom:-3, width:2, background:POSTER.paper }}/>}
      </div>

      <div style={{ marginTop:14, padding:14, background:'rgba(0,0,0,0.22)' }}>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.7 }}>ОСТАТОК ПО КАТЕГОРИИ → {rollLabel}</div>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:18, marginTop:4, color: over ? POSTER.paper : POSTER.yellow }}>
          {over ? `− ${fmt(Math.abs(left))} ₽` : `+ ${fmt(left)} ₽`}
        </div>
      </div>

      <div style={{ marginTop:14, display:'flex', gap:6 }}>
        <span style={{ padding:'8px 10px', background:POSTER.yellow, color:over ? POSTER.red : POSTER.cobalt, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em', cursor:'pointer' }}>+ ПОДНЯТЬ ЛИМИТ</span>
        <span style={{ padding:'8px 10px', border:'1px solid rgba(255,246,232,0.45)', fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em', cursor:'pointer' }}>ПАУЗА</span>
      </div>

      <Eye style={{ color:POSTER.paper, opacity:0.7, marginTop:24 }}>{txns.length} ЗАПИСЕЙ · РЕАЛЬНЫЕ ТРАНЗАКЦИИ</Eye>
      <div style={{ marginTop:4 }}>
        {txns.length === 0 && <div style={{ marginTop:12, fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:18, opacity:0.6 }}>Пока без операций.</div>}
        {txns.map((r,i) => (
          <div key={i} style={{
            display:'grid', gridTemplateColumns:'72px 1fr auto', gap:8, padding:'11px 0',
            borderTop:'1px solid rgba(255,246,232,0.25)', alignItems:'baseline',
            opacity:0, animation:`posterRowIn 0.4s cubic-bezier(0.22,0.61,0.36,1) ${0.3 + i*0.045}s forwards`,
          }}>
            <span style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.6, letterSpacing:'0.04em' }}>{r.d} {r.t || ''}</span>
            <span style={{ fontSize:13, fontWeight:600 }}>{r.n}</span>
            <span style={{ fontFamily:'JetBrains Mono', fontSize:14, fontWeight:600, whiteSpace:'nowrap' }}>{fmt(r.a)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────── MGMT (Бюджет / Аналитика / Подписки) ───────────────
function PosterMgmt({ onAnalytics, onBudget, onAccounts }) {
  const D = POSTER_DATA;
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const totalBal = D.accounts.reduce((s,a) => s+a.bal, 0);
  const items = [
    { id:'budget',   l:'PLAN МАЯ',     d:`8 категорий · лимит ${fmt(85500)} ₽`,             go:onBudget },
    { id:'accounts', l:'СЧЕТА',        d:`${D.accounts.length} счёта · ${fmt(totalBal)} ₽`, go:onAccounts },
    { id:'analyt',   l:'ANALYTICS',    d:'месяц / категории / тренды',                      go:onAnalytics },
  ];
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.black, color:POSTER.paper, padding:'56px 22px 90px', overflow:'auto', fontFamily:'Manrope' }}>
      <Eye style={{ opacity:0.55 }}>VOL.04 · MANAGEMENT</Eye>
      <Mass italic size={68} style={{ marginTop:6 }}>Управление.</Mass>
      <div style={{ marginTop:24 }}>
        {items.map((it, i) => (
          <div key={it.id} onClick={it.go} style={{
            display:'grid', gridTemplateColumns:'40px 1fr auto', gap:14, padding:'18px 0',
            borderTop:'1px solid rgba(255,246,232,0.18)',
            borderBottom: i===items.length-1 ? '1px solid rgba(255,246,232,0.18)' : 'none',
            cursor: it.go ? 'pointer' : 'default', opacity: it.go ? 1 : 0.65,
            alignItems:'center',
          }}>
            <span style={{ fontFamily:'JetBrains Mono', fontSize:12, opacity:0.55 }}>{String(i+1).padStart(2,'0')}</span>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:'Archivo Black', fontSize:18, letterSpacing:'0.02em' }}>{it.l}</span>
                {it.soon && (
                  <span style={{
                    fontFamily:'Archivo Black', fontSize:10, letterSpacing:'0.18em',
                    padding:'3px 6px', background:POSTER.yellow, color:POSTER.ink,
                  }}>SOON</span>
                )}
              </div>
              <div style={{ fontSize:12, opacity:0.6, marginTop:3 }}>{it.d}</div>
            </div>
            <span style={{ fontFamily:'JetBrains Mono', fontSize:14, opacity: it.go ? 1 : 0.3 }}>{it.go ? '→' : '·'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────── ANALYTICS ───────────────
function PosterAnalytics({ onBack }) {
  const D = POSTER_DATA;
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const RANGES = [
    { id:'mar', l:'МАР 26', total:71200, save: 4800, delta:'↑ 12%', days:[40,55,30,72,42,88,33,58,40,76,50,32,40,66,28,68,42,55,30,72,42,88,33,58,40,76,50,32,40,66,28] },
    { id:'apr', l:'АПР 26', total:69870, save:18420, delta:'↓ 2%',  days:[35,50,28,68,38,82,30,55,42,78,52,35,40,70,30,70,45,52,28,68,38,82,30,55,42,78,52,35,40,70] },
    { id:'may', l:'МАЙ 26', total:D.fact, save:D.surplus, delta:'↓ 8%', days:[30,50,22,70,40,90,35,60,45,80,55,38,42,68,30,72,48], current:true },
  ];
  const [rangeId, setRangeId] = React.useState('may');
  const range = RANGES.find(r => r.id === rangeId);
  const days = range.days;
  const grouping = ['ДЕНЬ','НЕД.', 'КАТ.'];
  const [grp, setGrp] = React.useState('ДЕНЬ');
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.cream, color:POSTER.ink, padding:'56px 22px 90px', overflow:'auto', fontFamily:'Manrope' }}>
      <div onClick={onBack} style={{ cursor:'pointer', marginBottom:8 }}>
        <Eye style={{ color:POSTER.ink, opacity:0.55 }}>← MGMT / ANALYTICS</Eye>
      </div>
      <Mass italic size={70} style={{ marginTop:4, color:POSTER.ink }}>Месяц.</Mass>

      <Eye style={{ color:POSTER.ink, opacity:0.55, marginTop:18 }}>ДИАПАЗОН</Eye>
      <div style={{ marginTop:6, display:'flex', border:`1px solid ${POSTER.ink}` }}>
        {RANGES.map((r, i) => (
          <span key={r.id} onClick={() => setRangeId(r.id)} style={{
            flex:1, padding:'10px 0', textAlign:'center', cursor:'pointer',
            borderLeft: i===0 ? 'none' : `1px solid ${POSTER.ink}`,
            background: rangeId===r.id ? POSTER.ink : 'transparent',
            color: rangeId===r.id ? POSTER.cream : POSTER.ink,
            fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em',
          }}>{r.l}{r.current ? ' •' : ''}</span>
        ))}
      </div>
      <div style={{ marginTop:6, display:'flex', justifyContent:'space-between' }}>
        <Eye style={{ color:POSTER.ink, opacity:0.45 }}>« РАНЕЕ</Eye>
        <Eye style={{ color:POSTER.ink, opacity:0.45 }}>ПОЛГОДА / ГОД</Eye>
      </div>

      <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        <div style={{ padding:'14px 12px', background:POSTER.ink, color:POSTER.cream }}>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.6 }}>ПОТРАЧЕНО</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:22, marginTop:4 }}>{fmt(range.total)}</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, marginTop:4, color:POSTER.yellow }}>{range.delta} к прошлому</div>
        </div>
        <div style={{ padding:'14px 12px', background:POSTER.yellow, color:POSTER.ink }}>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.7 }}>СЭКОНОМЛЕНО</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:22, marginTop:4 }}>+ {fmt(range.save)}</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, marginTop:4, opacity:0.7 }}>от плана</div>
        </div>
      </div>

      <div style={{ marginTop:18, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <Eye style={{ color:POSTER.ink, opacity:0.55 }}>ГРУППИРОВКА</Eye>
        <div style={{ display:'flex' }}>
          {grouping.map((g, i) => (
            <span key={g} onClick={() => setGrp(g)} style={{
              padding:'5px 10px', cursor:'pointer',
              border:`1px solid ${POSTER.ink}`,
              borderLeft: i===0 ? `1px solid ${POSTER.ink}` : 'none',
              background: grp===g ? POSTER.ink : 'transparent',
              color: grp===g ? POSTER.cream : POSTER.ink,
              fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em',
            }}>{g}</span>
          ))}
        </div>
      </div>
      <div style={{ marginTop:8, display:'flex', alignItems:'flex-end', gap:3, height:74 }}>
        {days.map((h,i) => (
          <div key={i} style={{ flex:1, height:`${h}%`, background: h>75 ? POSTER.red : POSTER.ink }}/>
        ))}
      </div>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55, display:'flex', justifyContent:'space-between', marginTop:4 }}>
        <span>1 ЧИСЛО</span><span>{range.current ? 'СЕГОДНЯ' : `ДНЕЙ: ${days.length}`}</span>
      </div>

      <Eye style={{ color:POSTER.ink, opacity:0.55, marginTop:22 }}>ТОП КАТЕГОРИЙ</Eye>
      <div style={{ marginTop:4 }}>
        {D.cats.slice(0,5).map((c,i) => (
          <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderTop:'1px solid rgba(27,26,24,0.2)', fontFamily:'Archivo Black', fontSize:13 }}>
            <span style={{ display:'flex', alignItems:'center', gap:8, color: c.over ? POSTER.red : POSTER.ink }}>
              {c.name}
              {c.over && (
                <span style={{ fontSize:10, letterSpacing:'0.18em', padding:'3px 6px', background:POSTER.red, color:POSTER.paper }}>OVER</span>
              )}
            </span>
            <span style={{ fontFamily:'JetBrains Mono', color: c.over ? POSTER.red : POSTER.ink }}>{fmt(c.act)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────── BUDGET SETUP ───────────────
function PosterBudget({ onBack, onCat, onSubs }) {
  const D = POSTER_DATA;
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const [limits, setLimits] = React.useState(Object.fromEntries(D.cats.map(c => [c.id, c.plan])));
  const [rolls,  setRolls ] = React.useState(Object.fromEntries(D.cats.map(c => [c.id, c.rollover || 'misc'])));
  const total = Object.values(limits).reduce((s,n) => s+n, 0);
  const income = 100000;
  const left = income - total;
  // unused = plan-fact across categories that finished under plan
  const unusedByDest = D.cats.reduce((acc, c) => {
    const u = Math.max(0, limits[c.id] - c.act);
    if (u > 0) acc[rolls[c.id]] = (acc[rolls[c.id]] || 0) + u;
    return acc;
  }, { misc:0, savings:0 });
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.cobalt, color:POSTER.paper, padding:'56px 22px 90px', overflow:'auto', fontFamily:'Manrope' }}>
      <div onClick={onBack} style={{ cursor:'pointer', marginBottom:8 }}>
        <Eye style={{ opacity:0.6 }}>← MGMT / LIMITS</Eye>
      </div>
      <Mass size={56} style={{ marginTop:4 }}>PLAN<br/>МАЯ.</Mass>

      <div style={{ marginTop:18, padding:14, background:'rgba(0,0,0,0.22)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.7 }}>ОСТАЛОСЬ РАСПРЕДЕЛИТЬ</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:22, marginTop:4, color: left<0 ? POSTER.yellow : POSTER.paper, whiteSpace:'nowrap' }}>{left>=0 ? '+ ' : '− '}{fmt(left)} ₽</div>
        </div>
        <span style={{ padding:'6px 10px', background: left>=0 ? POSTER.yellow : POSTER.red, color: left>=0 ? POSTER.cobalt : POSTER.paper, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em' }}>{left>=0 ? 'OK' : 'OVER'}</span>
      </div>

      <Eye style={{ marginTop:18, opacity:0.6 }}>ОСТАТОК ПО ИТОГУ МЕСЯЦА</Eye>
      <div style={{ marginTop:6, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        <div style={{ padding:'12px 10px', border:`1px solid rgba(255,246,232,0.2)` }}>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.14em', opacity:0.65 }}>→ ПРОЧЕЕ</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:18, marginTop:4 }}>{fmt(unusedByDest.misc)} ₽</div>
        </div>
        <div style={{ padding:'12px 10px', background:POSTER.yellow, color:POSTER.cobalt }}>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.14em', opacity:0.7 }}>→ НАКОПЛЕНИЯ</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:18, marginTop:4 }}>+ {fmt(unusedByDest.savings)} ₽</div>
        </div>
      </div>

      <PlanUpcoming onSubs={onSubs} />

      <Eye style={{ marginTop:18, opacity:0.6 }}>КАТЕГОРИИ · {D.cats.length}</Eye>
      <div style={{ marginTop:4 }}>
        {D.cats.map((c) => (
          <BudgetRow
            key={c.id} cat={c}
            value={limits[c.id]} onChange={v => setLimits(L => ({ ...L, [c.id]: v }))}
            roll={rolls[c.id]} onRoll={r => setRolls(R => ({ ...R, [c.id]: r }))}
            onOpen={() => onCat && onCat(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PlanUpcoming({ onSubs }) {
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const initial = [
    { id:'rent', n:'Аренда',          d:'15 числа', cat:'дом',      a:-32000 },
    { id:'utils',n:'ЖКУ',             d:'18 числа', cat:'дом',      a:-4200 },
    { id:'spo', n:'Spotify',          d:'12 числа', cat:'подписки', a:-899 },
    { id:'icl', n:'iCloud 200 ГБ',    d:'1 числа',  cat:'подписки', a:-299 },
  ];
  const [done, setDone] = React.useState({});
  const toggle = id => setDone(D => ({ ...D, [id]: !D[id] }));
  const pending = initial.filter(x => !done[x.id]);
  const totalPending = pending.reduce((s,x) => s + x.a, 0);
  return (
    <>
      <div style={{ marginTop:18, display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <Eye style={{ opacity:0.6 }}>РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ</Eye>
        {onSubs && <span onClick={onSubs} style={{ cursor:'pointer', fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55, letterSpacing:'0.06em', borderBottom:'1px dashed rgba(255,246,232,0.4)' }}>ВСЕ ПОДПИСКИ →</span>}
      </div>
      <div style={{ marginTop:6, padding:'10px 12px', background:'rgba(0,0,0,0.22)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.7 }}>{pending.length} ждут проведения</div>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:14, fontWeight:600, color:POSTER.yellow, whiteSpace:'nowrap' }}>{fmt(totalPending)} ₽</div>
      </div>
      <div style={{ marginTop:4 }}>
        {initial.map(it => {
          const isDone = !!done[it.id];
          return (
            <div key={it.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, padding:'12px 0', borderTop:'1px solid rgba(255,246,232,0.18)', alignItems:'center', opacity: isDone ? 0.5 : 1 }}>
              <div>
                <div style={{ fontFamily:'Archivo Black', fontSize:12, letterSpacing:'0.04em', textDecoration: isDone ? 'line-through' : 'none' }}>{it.n}</div>
                <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55, marginTop:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>{it.d} · {it.cat}</div>
              </div>
              <span style={{ fontFamily:'JetBrains Mono', fontSize:13, fontWeight:600, whiteSpace:'nowrap' }}>{fmt(it.a)}</span>
              <span onClick={() => toggle(it.id)} style={{
                padding:'5px 9px', cursor:'pointer',
                background: isDone ? 'transparent' : POSTER.yellow,
                color: isDone ? POSTER.paper : POSTER.cobalt,
                border: isDone ? '1px solid rgba(255,246,232,0.45)' : 'none',
                fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em',
                whiteSpace:'nowrap',
              }}>{isDone ? '↺ ОТМЕНА' : 'ПРОВЕСТИ →'}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function BudgetRow({ cat, value, onChange, roll, onRoll, onOpen }) {
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const max = 50000;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  const commit = () => {
    const n = Math.max(0, Math.min(max*4, parseInt(String(draft).replace(/\D/g,''),10) || 0));
    onChange(n);
    setEditing(false);
  };
  const factPct = Math.min(100, Math.round(cat.act / Math.max(1,value) * 100));
  const over    = cat.act > value;
  const left    = value - cat.act;
  return (
    <div style={{ padding:'14px 0', borderTop:'1px solid rgba(255,246,232,0.18)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:6, alignItems:'center' }}>
        <div onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:'Archivo Black', fontSize:12, letterSpacing:'0.05em' }}>{cat.name}</span>
            {over && <span style={{ fontSize:10, letterSpacing:'0.18em', padding:'2px 5px', background:POSTER.red, color:POSTER.paper, fontFamily:'Archivo Black' }}>OVER</span>}
          </div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.6, marginTop:3 }}>
            {fmt(cat.act)} / {fmt(value)} ₽ · {over ? '−' : '+'} {fmt(Math.abs(left))}
          </div>
        </div>
        {editing ? (
          <input
            autoFocus value={draft}
            onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); } }}
            style={{ width:90, textAlign:'right', background:'transparent', border:'none', borderBottom:`1px solid ${POSTER.yellow}`, outline:'none', color:POSTER.yellow, fontFamily:'JetBrains Mono', fontSize:14, fontWeight:600, padding:'2px 0' }}
          />
        ) : (
          <div onClick={() => setEditing(true)} style={{ fontFamily:'JetBrains Mono', fontSize:14, fontWeight:600, whiteSpace:'nowrap', padding:'2px 6px', borderBottom:'1px dashed rgba(255,246,232,0.35)', cursor:'pointer' }}>{fmt(value)}</div>
        )}
      </div>
      <div style={{ marginTop:8, position:'relative', height:4, background:'rgba(255,246,232,0.14)' }}>
        <div style={{ position:'absolute', inset:0, width:`${factPct}%`, background: over ? POSTER.red : POSTER.yellow }}/>
      </div>
      <input
        type="range" min="0" max={max} step="500" value={Math.min(value, max)}
        onChange={e => onChange(+e.target.value)}
        style={{ marginTop:8, width:'100%', appearance:'none', height:3, background:`linear-gradient(to right, ${POSTER.paper} 0 ${Math.min(value,max)/max*100}%, rgba(255,246,232,0.18) ${Math.min(value,max)/max*100}% 100%)`, outline:'none' }}
      />
      <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.14em', opacity:0.55 }}>ОСТАТОК →</span>
        {[
          { id:'misc',    l:'ПРОЧЕЕ' },
          { id:'savings', l:'НАКОПЛЕНИЯ' },
        ].map(o => (
          <span key={o.id} onClick={() => onRoll(o.id)} style={{
            padding:'4px 8px', cursor:'pointer',
            border: `1px solid ${roll===o.id ? POSTER.yellow : 'rgba(255,246,232,0.25)'}`,
            background: roll===o.id ? POSTER.yellow : 'transparent',
            color: roll===o.id ? POSTER.cobalt : POSTER.paper,
            fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em',
          }}>{o.l}</span>
        ))}
      </div>
    </div>
  );
}

// ─────────────── ACCOUNTS ───────────────
function PosterAccounts({ onBack, onAcc }) {
  const D = POSTER_DATA;
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const total = D.accounts.reduce((s,a) => s+a.bal, 0);
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.cream, color:POSTER.ink, padding:'56px 22px 110px', overflow:'auto', fontFamily:'Manrope' }}>
      <div onClick={onBack} style={{ cursor:'pointer', marginBottom:8 }}>
        <Eye style={{ color:POSTER.ink, opacity:0.55 }}>← MGMT / СЧЕТА</Eye>
      </div>
      <Mass italic size={68} style={{ marginTop:4, color:POSTER.ink }}>Счета.</Mass>

      <div style={{ marginTop:18, padding:14, background:POSTER.ink, color:POSTER.cream }}>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.6 }}>СУММАРНО</div>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:28, marginTop:4 }}>{fmt(total)} ₽</div>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.6, marginTop:4 }}>{D.accounts.length} счетов</div>
      </div>

      <Eye style={{ color:POSTER.ink, opacity:0.55, marginTop:22 }}>СЧЕТА · ТАП → ИСТОРИЯ</Eye>
      <div style={{ marginTop:4 }}>
        {D.accounts.map((a, i) => (
          <div key={a.id} onClick={() => onAcc && onAcc(a.id)} style={{ display:'grid', gridTemplateColumns:'40px 1fr auto', gap:14, padding:'18px 0', borderTop:'1px solid rgba(27,26,24,0.15)', alignItems:'center', cursor:'pointer' }}>
            <span style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.5 }}>{String(i+1).padStart(2,'0')}</span>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:'Archivo Black', fontSize:14, letterSpacing:'0.04em' }}>{a.bank}</span>
                {a.primary && <span style={{ fontSize:10, letterSpacing:'0.16em', padding:'2px 5px', background:POSTER.yellow, color:POSTER.ink, fontFamily:'Archivo Black' }}>ОСНОВНОЙ</span>}
              </div>
              <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55, marginTop:3 }}>
                {a.kind==='cash' ? 'наличные' : a.kind==='savings' ? 'накопит. счёт' : `карта ${a.mask}`}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontFamily:'JetBrains Mono', fontSize:14, fontWeight:600, whiteSpace:'nowrap' }}>{fmt(a.bal)} ₽</div>
              <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.45, marginTop:2 }}>история →</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop:24, display:'flex', gap:8 }}>
        <span style={{ flex:1, padding:'12px 0', textAlign:'center', border:`1px solid ${POSTER.ink}`, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor:'pointer' }}>+ ДОБАВИТЬ СЧЁТ</span>
        <span style={{ flex:1, padding:'12px 0', textAlign:'center', background:POSTER.ink, color:POSTER.cream, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor:'pointer' }}>ПЕРЕВОД</span>
      </div>
    </div>
  );
}

// ─────────────── ACCOUNT DETAIL (history) ───────────────
function PosterAccountDetail({ accId, onBack }) {
  const D = POSTER_DATA;
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const a = D.accounts.find(x => x.id === accId) || D.accounts[0];
  const days = D.txnsByDay.map(day => {
    const rows = day.rows.filter(r => r.acc === a.id);
    return { ...day, rows, s: rows.reduce((s,r) => s+r.a, 0) };
  }).filter(d => d.rows.length > 0);
  const monthSpent = days.reduce((s,d) => s + d.s, 0);
  const cnt = days.reduce((s,d) => s + d.rows.length, 0);
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.black, color:POSTER.paper, padding:'56px 22px 110px', overflow:'auto', fontFamily:'Manrope' }}>
      <div onClick={onBack} style={{ cursor:'pointer', marginBottom:8 }}>
        <Eye style={{ opacity:0.55 }}>← СЧЕТА / ИСТОРИЯ</Eye>
      </div>
      <Mass italic size={62} style={{ marginTop:4 }}>{a.bank}.</Mass>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55, marginTop:4, letterSpacing:'0.06em' }}>
        {a.kind==='cash' ? 'наличные' : a.kind==='savings' ? 'накопит. счёт' : `карта ${a.mask}`}
      </div>

      <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        <div style={{ padding:'14px 12px', background:POSTER.yellow, color:POSTER.ink }}>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.7 }}>БАЛАНС</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:22, marginTop:4 }}>{fmt(a.bal)}</div>
        </div>
        <div style={{ padding:'14px 12px', background:'rgba(255,246,232,0.08)' }}>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.6 }}>В МАЕ · {cnt} ОПЕРАЦ.</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:22, marginTop:4 }}>{fmt(monthSpent)}</div>
        </div>
      </div>

      <Eye style={{ marginTop:22, opacity:0.55 }}>ИСТОРИЯ</Eye>
      {days.length === 0 && (
        <div style={{ marginTop:18, fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:20, opacity:0.6 }}>По счёту пока нет операций.</div>
      )}
      {days.map((day, i) => (
        <div key={i} style={{ marginTop:18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
            <div style={{ fontFamily:'DM Serif Display', fontSize:24, fontStyle:'italic' }}>{day.d}</div>
            <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.6 }}>{fmt(day.s)} ₽</div>
          </div>
          {day.rows.map((r, j) => (
            <div key={j} style={{ display:'grid', gridTemplateColumns:'52px 1fr auto', gap:10, padding:'11px 0', borderTop:'1px solid rgba(255,246,232,0.18)', alignItems:'baseline' }}>
              <span style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55 }}>{r.t}</span>
              <span style={{ fontSize:13, fontWeight:600 }}>
                {r.n}
                <small style={{ display:'block', fontWeight:400, fontSize:11, opacity:0.55, marginTop:2, letterSpacing:'0.06em', textTransform:'uppercase' }}>{r.cat}</small>
              </span>
              <span style={{ fontFamily:'JetBrains Mono', fontSize:14, fontWeight:600, whiteSpace:'nowrap' }}>{fmt(r.a)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────── SAVINGS ───────────────
function PosterSavings({ onBack }) {
  const D = POSTER_DATA;
  const fmt = n => Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const S = D.savings;
  const [round, setRound] = React.useState(S.roundup.on);
  const [base,  setBase ] = React.useState(S.roundup.base);
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.black, color:POSTER.paper, padding:'56px 22px 110px', overflow:'auto', fontFamily:'Manrope' }}>
      <div onClick={onBack} style={{ cursor:'pointer', marginBottom:8 }}>
        <Eye style={{ opacity:0.55 }}>← MGMT / НАКОПЛЕНИЯ</Eye>
      </div>
      <Mass italic size={68} style={{ marginTop:4 }}>Копилка.</Mass>

      <div style={{ marginTop:18, padding:14, background:POSTER.yellow, color:POSTER.ink, display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.65 }}>НАКОПЛЕНО ВСЕГО</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:28, marginTop:4 }}>{fmt(S.total)} ₽</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.16em', opacity:0.65 }}>В МАЕ</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:18, marginTop:4 }}>+ {fmt(S.monthIn)} ₽</div>
        </div>
      </div>

      <Eye style={{ marginTop:22, opacity:0.55 }}>ОКРУГЛЕНИЕ ТРАТ</Eye>
      <div style={{ marginTop:6, padding:14, border:'1px solid rgba(255,246,232,0.18)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:'Archivo Black', fontSize:13, letterSpacing:'0.04em' }}>ОКРУГЛЯТЬ ДО {base} ₽</span>
          <span onClick={() => setRound(!round)} style={{
            padding:'5px 10px', cursor:'pointer',
            background: round ? POSTER.yellow : 'transparent',
            color: round ? POSTER.ink : POSTER.paper,
            border: `1px solid ${POSTER.yellow}`,
            fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em',
          }}>{round ? 'ВКЛ' : 'ВЫКЛ'}</span>
        </div>
        <div style={{ marginTop:8, fontFamily:'JetBrains Mono', fontSize:11, opacity:0.6 }}>в этом месяце скоплено: + {fmt(S.roundup.mtd)} ₽</div>
        <div style={{ marginTop:10, display:'flex', gap:6 }}>
          {[10,50,100].map(b => (
            <span key={b} onClick={() => setBase(b)} style={{
              flex:1, padding:'8px 0', textAlign:'center', cursor:'pointer',
              border:`1px solid ${base===b ? POSTER.yellow : 'rgba(255,246,232,0.2)'}`,
              background: base===b ? POSTER.yellow : 'transparent',
              color: base===b ? POSTER.ink : POSTER.paper,
              fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.1em',
            }}>{b} ₽</span>
          ))}
        </div>
      </div>

      <Eye style={{ marginTop:22, opacity:0.55 }}>ЦЕЛИ</Eye>
      <div style={{ marginTop:4 }}>
        {S.goals.map((g, i) => {
          const pct = Math.min(100, Math.round(g.cur / g.target * 100));
          return (
            <div key={g.id} style={{ padding:'16px 0', borderTop:'1px solid rgba(255,246,232,0.18)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
                <div>
                  <div style={{ fontFamily:'Archivo Black', fontSize:14, letterSpacing:'0.04em' }}>{g.name}</div>
                  <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55, marginTop:3 }}>срок · {g.due}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'JetBrains Mono', fontSize:13, fontWeight:600 }}>{fmt(g.cur)} / {fmt(g.target)}</div>
                  <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55, marginTop:2 }}>{pct}%</div>
                </div>
              </div>
              <div style={{ marginTop:10, position:'relative', height:4, background:'rgba(255,246,232,0.14)' }}>
                <div style={{ position:'absolute', inset:0, width:`${pct}%`, background:POSTER.yellow }}/>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop:22, display:'flex', gap:8 }}>
        <span style={{ flex:1, padding:'12px 0', textAlign:'center', border:`1px solid ${POSTER.yellow}`, color:POSTER.yellow, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor:'pointer' }}>+ НОВАЯ ЦЕЛЬ</span>
        <span style={{ flex:1, padding:'12px 0', textAlign:'center', background:POSTER.yellow, color:POSTER.ink, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor:'pointer' }}>ПОПОЛНИТЬ</span>
      </div>
    </div>
  );
}

// ─────────────── SUBSCRIPTIONS ───────────────
function PosterSubs({ onBack }) {
  const [active, setActive] = React.useState(null);
  const subs = [
    { n:'Spotify Family',   p:899,  d:'каждое 12 число' },
    { n:'iCloud 200 ГБ',    p:299,  d:'каждое 1 число' },
    { n:'Yandex Plus',      p:399,  d:'каждое 5 число' },
    { n:'Кинопоиск',        p:499,  d:'каждое 18 число' },
    { n:'GitHub Copilot',   p:1404, d:'каждое 22 число' },
  ];
  const total = subs.reduce((s,x) => s+x.p, 0);
  const fmt = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.coral, color:POSTER.paper, padding:'56px 22px 90px', overflow:'auto', fontFamily:'Manrope' }}>
      <div onClick={onBack} style={{ cursor:'pointer', marginBottom:8 }}>
        <Eye style={{ opacity:0.7 }}>← MGMT / SUBS</Eye>
      </div>
      <Mass italic size={68} style={{ marginTop:4 }}>Подписки.</Mass>
      <div style={{ marginTop:14 }}>
        <BigFig sup="₽/мес" color={POSTER.paper} size={56}>{fmt(total)}</BigFig>
        <Eye style={{ opacity:0.7, marginTop:6 }}>{subs.length} АКТИВНЫХ · {fmt(total*12)} ₽ В ГОД</Eye>
      </div>
      <div style={{ marginTop:24 }}>
        {subs.map((s,i) => (
          <div key={i} onClick={() => setActive(s)} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, padding:'14px 0', borderTop:'1px solid rgba(255,246,232,0.25)', alignItems:'center', cursor:'pointer' }}>
            <div>
              <div style={{ fontFamily:'Archivo Black', fontSize:14, letterSpacing:'0.02em' }}>{s.n.toUpperCase()}</div>
              <div style={{ fontSize:11, opacity:0.7, marginTop:3 }}>{s.d}</div>
            </div>
            <div style={{ fontFamily:'JetBrains Mono', fontSize:15, fontWeight:600, whiteSpace:'nowrap' }}>{fmt(s.p)} ₽</div>
            <span style={{ padding:'4px 8px', background:'rgba(0,0,0,0.18)', fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.14em' }}>···</span>
          </div>
        ))}
      </div>

      {active && (
        <div onClick={() => setActive(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'flex-end', zIndex:250 }}>
          <div onClick={e => e.stopPropagation()} style={{ width:'100%', background:POSTER.paper, color:POSTER.ink, padding:'24px 22px 110px' }}>
            <Eye style={{ color:POSTER.ink, opacity:0.55 }}>ПОДПИСКА</Eye>
            <div style={{ fontFamily:'Archivo Black', fontSize:18, marginTop:6 }}>{active.n.toUpperCase()}</div>
            <div style={{ fontFamily:'JetBrains Mono', fontSize:13, marginTop:4, opacity:0.7 }}>{fmt(active.p)} ₽ · {active.d}</div>
            <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {['ПАУЗА','СМЕНИТЬ ДЕНЬ','ИЗМЕНИТЬ ЦЕНУ'].map(l => (
                <span key={l} onClick={() => setActive(null)} style={{
                  padding:'14px 0', textAlign:'center',
                  border:`1px solid ${POSTER.ink}`,
                  background:'transparent', color: POSTER.ink,
                  fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em', cursor:'pointer',
                }}>{l}</span>
              ))}
            </div>
            <div style={{ marginTop:8 }}>
              <span onClick={() => setActive(null)} style={{
                display:'block', padding:'14px 0', textAlign:'center',
                background:POSTER.red, color:POSTER.paper,
                fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor:'pointer',
              }}>ОТМЕНИТЬ ПОДПИСКУ</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── ADD TXN SHEET ───────────────
function PosterAddSheet({ onSave, onClose }) {
  const [amount, setAmount] = React.useState(0);
  const [name, setName] = React.useState('');
  const [cat, setCat] = React.useState(null);
  const [day, setDay] = React.useState('today');
  const [confirmClose, setConfirmClose] = React.useState(false);
  const fmt = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  const cats = ['КАФЕ','ПРОДУКТЫ','ДОМ','ТРАНСПОРТ','РАЗВЛЕЧ.','ПОДАРКИ','ЗДОРОВЬЕ','ПОДПИСКИ'];
  const dirty = amount > 0 || name.length > 0;
  const valid = amount > 0 && cat;
  const tryClose = () => { if (dirty) setConfirmClose(true); else onClose(); };
  const pad = (k) => {
    if (k === '⌫') setAmount(a => Math.floor(a/10));
    else setAmount(a => Math.min(a*10 + +k, 9999999));
  };
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.black, color:POSTER.paper, padding:'40px 22px 28px', overflow:'auto', fontFamily:'Manrope', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <Eye style={{ opacity:0.55 }}>NEW ENTRY · 09 MAY · 14:32</Eye>
        <div onClick={tryClose} style={{ cursor:'pointer', fontFamily:'JetBrains Mono', fontSize:18, opacity:0.7, padding:'4px 8px' }}>×</div>
      </div>
      <div style={{ marginTop:14 }}>
        <BigFig sup="₽" color={POSTER.yellow} size={86}>{fmt(amount)}</BigFig>
      </div>
      <div style={{ marginTop:12 }}>
        <Eye style={{ opacity:0.55 }}>Описание</Eye>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="кафе / продукты / …"
          style={{
            marginTop:6, background:'transparent',
            border:'none', borderBottom:'1px dashed rgba(255,246,232,0.45)',
            outline:'none', paddingBottom:6,
            fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:24,
            color:POSTER.paper, width:'100%',
          }}
        />
      </div>

      <Eye style={{ opacity:0.55, marginTop:18 }}>Когда</Eye>
      <div style={{ marginTop:8, display:'flex', gap:5 }}>
        {[['today','СЕГОДНЯ'],['yesterday','ВЧЕРА'],['custom','СВОЯ ДАТА']].map(([id,l]) => (
          <span key={id} onClick={() => setDay(id)} style={{
            padding:'8px 11px',
            background: day===id ? POSTER.paper : 'transparent',
            color: day===id ? POSTER.black : POSTER.paper,
            border: day===id ? 'none' : '1px solid rgba(255,246,232,0.35)',
            fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em', cursor:'pointer',
          }}>{l}</span>
        ))}
      </div>
      <Eye style={{ opacity:0.55, marginTop:18 }}>Категория</Eye>
      <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:5 }}>
        {cats.map(c => (
          <span key={c} onClick={() => setCat(c)} style={{
            padding:'8px 11px',
            background: cat===c ? POSTER.yellow : 'transparent',
            color: cat===c ? POSTER.black : POSTER.paper,
            border: cat===c ? 'none' : '1px solid rgba(255,246,232,0.35)',
            fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.14em', cursor:'pointer',
          }}>{c}</span>
        ))}
      </div>

      <Eye style={{ opacity:0.55, marginTop:18 }}>Счёт</Eye>
      <div style={{ marginTop:8, padding:'13px 14px', border:'1px solid rgba(255,246,232,0.25)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:13, fontWeight:600 }}>ТИНЬКОФФ · 3477</span>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.55 }}>сменить ↓</span>
      </div>

      <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
        {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k => (
          <div key={k} onClick={() => pad(k)} style={{
            padding:'18px 0', textAlign:'center',
            background:'rgba(255,246,232,0.06)',
            border:'1px solid rgba(255,246,232,0.14)',
            fontFamily:'JetBrains Mono', fontSize:20, fontWeight:600, cursor:'pointer',
            opacity: k === '.' ? 0.45 : 1,
          }}>{k}</div>
        ))}
      </div>

      <div style={{ marginTop:14 }}>
        <span onClick={() => valid && onSave({ amount, name: name || 'без описания', cat })} style={{
          display:'block', padding:'16px 0', textAlign:'center',
          background: valid ? POSTER.yellow : 'rgba(255,246,232,0.12)',
          color: valid ? POSTER.black : 'rgba(255,246,232,0.5)',
          fontFamily:'Archivo Black', fontSize:12, letterSpacing:'0.18em',
          cursor: valid ? 'pointer' : 'not-allowed',
        }}>{valid ? 'СОХРАНИТЬ ↵' : (amount===0 ? 'ВВЕДИТЕ СУММУ' : 'ВЫБЕРИТЕ КАТЕГОРИЮ')}</span>
      </div>

      {confirmClose && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'flex-end', zIndex:10 }} onClick={() => setConfirmClose(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width:'100%', background:POSTER.paper, color:POSTER.ink, padding:'24px 22px 28px' }}>
            <Eye style={{ color:POSTER.ink, opacity:0.55 }}>ОТМЕНИТЬ ЗАПИСЬ?</Eye>
            <div style={{ fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:22, marginTop:8 }}>
              Сумма {fmt(amount)} ₽ не сохранена.
            </div>
            <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <span onClick={() => setConfirmClose(false)} style={{ padding:'14px 0', textAlign:'center', border:`1px solid ${POSTER.ink}`, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor:'pointer' }}>ПРОДОЛЖИТЬ</span>
              <span onClick={onClose} style={{ padding:'14px 0', textAlign:'center', background:POSTER.ink, color:POSTER.paper, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor:'pointer' }}>ОТМЕНИТЬ</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── ONBOARDING ───────────────
const ONB_DEFAULT_CATS = [
  { id:'food',    name:'ПРОДУКТЫ',  n:'01', share:0.20 },
  { id:'cafe',    name:'КАФЕ',      n:'02', share:0.10 },
  { id:'home',    name:'ДОМ',       n:'03', share:0.30 },
  { id:'transit', name:'ТРАНСПОРТ', n:'04', share:0.06 },
  { id:'fun',     name:'РАЗВЛЕЧ.',  n:'05', share:0.05 },
  { id:'gifts',   name:'ПОДАРКИ',   n:'06', share:0.04 },
  { id:'health',  name:'ЗДОРОВЬЕ',  n:'07', share:0.05 },
  { id:'subs',    name:'ПОДПИСКИ',  n:'08', share:0.03 },
];
const fmtNum = n => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
function OnbCTA({ children, disabled, onClick, ghost, style }) {
  return (
    <div onClick={disabled ? undefined : onClick} className="poster-press" style={{
      padding:'18px 0', textAlign:'center',
      background: ghost ? 'transparent' : POSTER.paper,
      color: ghost ? POSTER.paper : POSTER.coral,
      border: ghost ? '1px solid rgba(255,246,232,0.5)' : 'none',
      fontFamily:'Archivo Black', fontSize:13, letterSpacing:'0.18em', cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1, ...style,
    }}>{children}</div>
  );
}
function OnbDots({ step, total }) {
  return (
    <div style={{ display:'flex', gap:6, marginBottom:14 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex:1, height:2,
          background: i < step ? POSTER.paper : 'rgba(255,246,232,0.25)',
          transition:'background .3s',
        }}/>
      ))}
    </div>
  );
}
function OnbChrome({ step, total, label, onBack, onSkip, onNext, nextLabel='ДАЛЕЕ →', nextDisabled, hint, children }) {
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.coral, color:POSTER.paper, padding:'56px 22px 28px', overflow:'auto', fontFamily:'Manrope', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <span onClick={onBack} style={{ cursor: onBack ? 'pointer' : 'default', fontFamily:'JetBrains Mono', fontSize:14, opacity: onBack ? 0.85 : 0.25 }}>←</span>
        <Eye style={{ color:POSTER.paper, opacity:0.65 }}>{label}</Eye>
        <span onClick={onSkip} style={{ cursor: onSkip ? 'pointer' : 'default', fontFamily:'JetBrains Mono', fontSize:11, opacity: onSkip ? 0.7 : 0, letterSpacing:'0.14em' }}>ПРОПУСТИТЬ</span>
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column' }}>{children}</div>
      <div style={{ marginTop:14 }}>
        {hint && <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.65, marginBottom:10, textAlign:'center', letterSpacing:'0.06em' }}>{hint}</div>}
        <OnbDots step={step} total={total}/>
        <OnbCTA disabled={nextDisabled} onClick={onNext}>{nextLabel}</OnbCTA>
      </div>
    </div>
  );
}
function OnbWelcome({ onNext }) {
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.coral, color:POSTER.paper, padding:'80px 22px 28px', overflow:'hidden', fontFamily:'Manrope', display:'flex', flexDirection:'column' }}>
      <Eye style={{ color:POSTER.paper, animation:'posterRiseIn .55s cubic-bezier(0.22,0.61,0.36,1) both' }}>VOL.04 · ISSUE 09</Eye>
      <Mass size={92} style={{ marginTop:14, animation:'posterRiseIn .65s cubic-bezier(0.22,0.61,0.36,1) .08s both' }}>SPEND<br/>RIGHT.</Mass>
      <Mass italic size={32} style={{ marginTop:10, color:POSTER.paper, opacity:0.9, animation:'posterRiseIn .65s cubic-bezier(0.22,0.61,0.36,1) .18s both' }}>один план,<br/>один кошелёк.</Mass>
      <div style={{ marginTop:'auto' }}>
        <div style={{ borderTop:'1px solid rgba(255,246,232,0.4)', paddingTop:14, marginBottom:14 }}>
          {[['01','Доход и счета'],['02','Распредели по плану'],['03','Записывай в один тап']].map(([n,t], i) => (
            <div key={n} style={{ display:'flex', gap:14, padding:'10px 0', alignItems:'baseline', opacity:0, animation:`posterRowIn .45s cubic-bezier(0.22,0.61,0.36,1) ${0.32 + i*0.09}s forwards` }}>
              <span style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.7 }}>{n}</span>
              <span style={{ fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:18 }}>{t}</span>
            </div>
          ))}
        </div>
        <OnbCTA onClick={onNext} style={{ animation:'posterRiseIn .5s cubic-bezier(0.22,0.61,0.36,1) .65s both' }}>+ НАСТРОИТЬ ЗА МИНУТУ</OnbCTA>
      </div>
    </div>
  );
}
function OnbIncome({ income, setIncome, mode, setMode, onNext, onBack }) {
  const presets = [50000, 80000, 120000, 200000];
  return (
    <OnbChrome step={1} total={4} label="ШАГ 01 / 04 · ДОХОД" onBack={onBack} onNext={onNext}
      nextDisabled={!income || income <= 0}>
      <Mass italic size={36} style={{ marginTop:8, color:POSTER.paper, lineHeight:1.05 }}>Какой доход<br/>в месяц?</Mass>
      <Eye style={{ color:POSTER.paper, opacity:0.55, marginTop:8 }}>ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ</Eye>
      <div style={{ marginTop:18, display:'flex', alignItems:'baseline', gap:6, borderBottom:'1px solid rgba(255,246,232,0.5)', paddingBottom:8 }}>
        <input
          type="text" inputMode="numeric"
          value={income ? fmtNum(income) : ''}
          onChange={e => setIncome(parseInt(e.target.value.replace(/\D/g,''),10) || 0)}
          placeholder="0"
          style={{
            flex:1, background:'transparent', border:'none', outline:'none',
            color:POSTER.paper, fontFamily:'Archivo Black', fontSize:48, letterSpacing:'-0.02em',
          }}
        />
        <span style={{ fontFamily:'Archivo Black', fontSize:32 }}>₽</span>
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }}>
        {presets.map(p => (
          <span key={p} onClick={() => setIncome(p)} className="poster-press" style={{
            padding:'6px 10px', fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.06em',
            border:'1px solid rgba(255,246,232,0.4)', cursor:'pointer',
            background: income === p ? POSTER.paper : 'transparent',
            color: income === p ? POSTER.coral : POSTER.paper,
          }}>{fmtNum(p)}</span>
        ))}
      </div>
      <Eye style={{ color:POSTER.paper, opacity:0.55, marginTop:24 }}>КАК ПРИХОДИТ</Eye>
      <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
        {[
          { id:'once',  l:'Раз в месяц' },
          { id:'split', l:'Аванс + зарплата' },
          { id:'irreg', l:'Нерегулярно (фриланс)' },
        ].map(o => (
          <div key={o.id} onClick={() => setMode(o.id)} className="poster-press" style={{
            padding:'12px 14px', cursor:'pointer',
            border:`1px solid ${mode === o.id ? POSTER.paper : 'rgba(255,246,232,0.3)'}`,
            background: mode === o.id ? 'rgba(255,246,232,0.12)' : 'transparent',
            fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:18,
            display:'flex', justifyContent:'space-between', alignItems:'center',
          }}>
            <span>{o.l}</span>
            <span style={{ fontFamily:'JetBrains Mono', fontSize:14, opacity: mode === o.id ? 1 : 0.4 }}>{mode === o.id ? '●' : '○'}</span>
          </div>
        ))}
      </div>
    </OnbChrome>
  );
}
function OnbAccounts({ accounts, setAccounts, onNext, onBack }) {
  const [adding, setAdding] = React.useState(accounts.length === 0);
  const [name, setName] = React.useState('');
  const [bal, setBal] = React.useState(0);
  const add = () => {
    if (!name) return;
    const id = `acc${Date.now()}`;
    const isFirst = accounts.length === 0;
    setAccounts([...accounts, { id, name: name.toUpperCase(), bal, primary: isFirst }]);
    setName(''); setBal(0); setAdding(false);
  };
  const setPrimary = id => setAccounts(accounts.map(a => ({ ...a, primary: a.id === id })));
  const remove = id => setAccounts(accounts.filter(a => a.id !== id));
  const total = accounts.reduce((s,a) => s+a.bal, 0);
  return (
    <OnbChrome step={2} total={4} label="ШАГ 02 / 04 · СЧЕТА" onBack={onBack} onNext={onNext}
      nextDisabled={accounts.length === 0}
      hint={accounts.length ? `${accounts.length} ${accounts.length === 1 ? 'счёт' : 'счёта'} · ${fmtNum(total)} ₽` : 'нужен минимум один счёт'}>
      <Mass italic size={32} style={{ marginTop:8, color:POSTER.paper, lineHeight:1.05 }}>Где лежат<br/>деньги?</Mass>
      <Eye style={{ color:POSTER.paper, opacity:0.55, marginTop:8 }}>ВСЕ КАРТЫ И НАЛИЧНЫЕ</Eye>

      <div style={{ marginTop:14 }}>
        {accounts.map(a => (
          <div key={a.id} style={{ padding:'12px 0', borderTop:'1px solid rgba(255,246,232,0.25)', display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, alignItems:'center' }}>
            <div>
              <div style={{ fontFamily:'Archivo Black', fontSize:13, letterSpacing:'0.04em' }}>{a.name}</div>
              <div style={{ fontFamily:'JetBrains Mono', fontSize:11, opacity:0.6, marginTop:2 }}>{fmtNum(a.bal)} ₽ {a.primary && '· основной'}</div>
            </div>
            <span onClick={() => setPrimary(a.id)} style={{ cursor:'pointer', padding:'4px 8px', fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.1em',
              background: a.primary ? POSTER.paper : 'transparent',
              color: a.primary ? POSTER.coral : POSTER.paper,
              border: a.primary ? 'none' : '1px solid rgba(255,246,232,0.4)' }}>★</span>
            <span onClick={() => remove(a.id)} style={{ cursor:'pointer', fontFamily:'JetBrains Mono', fontSize:13, opacity:0.5 }}>×</span>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{ marginTop:14, padding:'14px', border:'1px solid rgba(255,246,232,0.45)' }}>
          <Eye style={{ color:POSTER.paper, opacity:0.6, marginBottom:8 }}>НОВЫЙ СЧЁТ</Eye>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Название (Т-Банк, наличные…)" style={{
            width:'100%', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,246,232,0.4)', outline:'none',
            color:POSTER.paper, fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:18, padding:'6px 0',
          }}/>
          <div style={{ display:'flex', alignItems:'baseline', gap:6, marginTop:10, borderBottom:'1px solid rgba(255,246,232,0.4)', paddingBottom:6 }}>
            <input type="text" inputMode="numeric" value={bal ? fmtNum(bal) : ''}
              onChange={e => setBal(parseInt(e.target.value.replace(/\D/g,''),10) || 0)}
              placeholder="0"
              style={{ flex:1, background:'transparent', border:'none', outline:'none', color:POSTER.paper, fontFamily:'Archivo Black', fontSize:24 }}/>
            <span style={{ fontFamily:'Archivo Black', fontSize:18 }}>₽</span>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <span onClick={() => { setAdding(false); setName(''); setBal(0); }} className="poster-press" style={{ flex:1, padding:'10px 0', textAlign:'center', border:'1px solid rgba(255,246,232,0.4)', fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor:'pointer' }}>ОТМЕНА</span>
            <span onClick={add} className="poster-press" style={{ flex:1, padding:'10px 0', textAlign:'center', background:POSTER.paper, color:POSTER.coral, fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em', cursor: name ? 'pointer' : 'not-allowed', opacity: name ? 1 : 0.45 }}>ДОБАВИТЬ</span>
          </div>
        </div>
      ) : (
        <span onClick={() => setAdding(true)} className="poster-press" style={{ display:'block', marginTop:14, padding:'14px 0', textAlign:'center', border:'1px dashed rgba(255,246,232,0.45)', fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.18em', cursor:'pointer' }}>+ ДОБАВИТЬ СЧЁТ</span>
      )}
    </OnbChrome>
  );
}
function OnbPlan({ income, plan, setPlan, onNext, onBack }) {
  const total = ONB_DEFAULT_CATS.reduce((s,c) => s + (plan[c.id] ?? Math.round(income * c.share / 500) * 500), 0);
  const left = income - total;
  const max = Math.max(income, 1);
  return (
    <OnbChrome step={3} total={4} label="ШАГ 03 / 04 · ПЛАН" onBack={onBack} onNext={onNext}
      nextDisabled={left < 0}
      hint={left >= 0 ? `остаётся ${fmtNum(left)} ₽ → накопления` : `превышение на ${fmtNum(Math.abs(left))} ₽`}>
      <Mass italic size={32} style={{ marginTop:8, color:POSTER.paper, lineHeight:1.05 }}>Распредели<br/>{fmtNum(income)} ₽</Mass>
      <Eye style={{ color:POSTER.paper, opacity:0.55, marginTop:8 }}>СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ</Eye>

      <div style={{ marginTop:14 }}>
        {ONB_DEFAULT_CATS.map(c => {
          const v = plan[c.id] ?? Math.round(income * c.share / 500) * 500;
          const pct = Math.min(100, Math.round(v / max * 100));
          return (
            <div key={c.id} style={{ padding:'10px 0', borderTop:'1px solid rgba(255,246,232,0.22)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', fontSize:13, fontWeight:700 }}>
                <span style={{ display:'flex', gap:10, alignItems:'baseline' }}>
                  <span style={{ opacity:0.5, fontSize:11, fontFamily:'JetBrains Mono' }}>{c.n}</span>
                  <span>{c.name}</span>
                </span>
                <span style={{ fontFamily:'JetBrains Mono' }}>{fmtNum(v)} ₽</span>
              </div>
              <input type="range" min={0} max={Math.max(60000, Math.round(income * 0.6))} step={500} value={v}
                onChange={e => setPlan({ ...plan, [c.id]: parseInt(e.target.value, 10) })}
                style={{
                  width:'100%', marginTop:6, height:24,
                  background:`linear-gradient(to right, ${POSTER.paper} 0 ${Math.min(100, v / Math.max(60000, Math.round(income * 0.6)) * 100)}%, rgba(255,246,232,0.25) ${Math.min(100, v / Math.max(60000, Math.round(income * 0.6)) * 100)}% 100%)`,
                  backgroundSize:'100% 2px', backgroundPosition:'center', backgroundRepeat:'no-repeat',
                }}/>
            </div>
          );
        })}
      </div>
    </OnbChrome>
  );
}
function OnbGoal({ goal, setGoal, onNext, onSkip, onBack }) {
  const presets = [{ name:'Подушка', amount:200000 }, { name:'Грузия', amount:120000 }, { name:'Ноутбук', amount:150000 }];
  return (
    <OnbChrome step={4} total={4} label="ШАГ 04 / 04 · ЦЕЛЬ" onBack={onBack} onNext={onNext} onSkip={onSkip}
      nextLabel="ГОТОВО →"
      nextDisabled={!goal.name && !goal.amount}>
      <Mass italic size={32} style={{ marginTop:8, color:POSTER.paper, lineHeight:1.05 }}>Зачем копишь?</Mass>
      <Eye style={{ color:POSTER.paper, opacity:0.55, marginTop:8 }}>МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ</Eye>

      <input value={goal.name} onChange={e => setGoal({ ...goal, name: e.target.value })}
        placeholder="Цель (Грузия, подушка, ноутбук…)"
        style={{ marginTop:18, width:'100%', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,246,232,0.4)', outline:'none',
          color:POSTER.paper, fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:22, padding:'8px 0' }}/>
      <div style={{ display:'flex', alignItems:'baseline', gap:6, marginTop:14, borderBottom:'1px solid rgba(255,246,232,0.4)', paddingBottom:6 }}>
        <input type="text" inputMode="numeric" value={goal.amount ? fmtNum(goal.amount) : ''}
          onChange={e => setGoal({ ...goal, amount: parseInt(e.target.value.replace(/\D/g,''),10) || 0 })}
          placeholder="0"
          style={{ flex:1, background:'transparent', border:'none', outline:'none', color:POSTER.paper, fontFamily:'Archivo Black', fontSize:36 }}/>
        <span style={{ fontFamily:'Archivo Black', fontSize:24 }}>₽</span>
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:14 }}>
        {presets.map(p => (
          <span key={p.name} onClick={() => setGoal(p)} className="poster-press" style={{
            padding:'6px 10px', fontFamily:'JetBrains Mono', fontSize:11, letterSpacing:'0.06em',
            border:'1px solid rgba(255,246,232,0.4)', cursor:'pointer',
            background: goal.name === p.name ? POSTER.paper : 'transparent',
            color: goal.name === p.name ? POSTER.coral : POSTER.paper,
          }}>{p.name} · {fmtNum(p.amount)}</span>
        ))}
      </div>
    </OnbChrome>
  );
}
function OnbDone({ income, accounts, plan, goal, onStart }) {
  const planTotal = ONB_DEFAULT_CATS.reduce((s,c) => s + (plan[c.id] ?? Math.round(income * c.share / 500) * 500), 0);
  const accTotal = accounts.reduce((s,a) => s+a.bal, 0);
  return (
    <div style={{ position:'absolute', inset:0, background:POSTER.coral, color:POSTER.paper, padding:'56px 22px 28px', overflow:'auto', fontFamily:'Manrope', display:'flex', flexDirection:'column' }}>
      <Eye style={{ color:POSTER.paper, opacity:0.65, animation:'posterRiseIn .5s ease-out both' }}>VOL.04 · ГОТОВО</Eye>
      <Mass size={88} style={{ marginTop:10, animation:'posterRiseIn .6s cubic-bezier(0.22,0.61,0.36,1) .08s both' }}>ВСЁ.</Mass>
      <Mass italic size={28} style={{ marginTop:6, opacity:0.9, animation:'posterRiseIn .6s cubic-bezier(0.22,0.61,0.36,1) .18s both' }}>деньги — под&nbsp;контролем.</Mass>

      <div style={{ marginTop:24, borderTop:'1px solid rgba(255,246,232,0.4)' }}>
        {[
          ['ДОХОД',     `${fmtNum(income)} ₽ / мес`],
          ['СЧЕТА',     `${accounts.length} · ${fmtNum(accTotal)} ₽`],
          ['ПЛАН',      `${fmtNum(planTotal)} ₽ распределено`],
          goal && goal.name ? ['ЦЕЛЬ', `${goal.name} · ${fmtNum(goal.amount)} ₽`] : null,
        ].filter(Boolean).map(([l,v], i) => (
          <div key={l} style={{ padding:'14px 0', borderBottom:'1px solid rgba(255,246,232,0.25)', display:'flex', justifyContent:'space-between', alignItems:'baseline',
            opacity:0, animation:`posterRowIn .45s cubic-bezier(0.22,0.61,0.36,1) ${0.32 + i*0.09}s forwards` }}>
            <Eye style={{ color:POSTER.paper, opacity:0.6 }}>{l}</Eye>
            <span style={{ fontFamily:'DM Serif Display', fontStyle:'italic', fontSize:18 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop:'auto', paddingTop:18 }}>
        <OnbCTA onClick={onStart} style={{ animation:'posterRiseIn .5s cubic-bezier(0.22,0.61,0.36,1) .6s both' }}>ОТКРЫТЬ БЮДЖЕТ →</OnbCTA>
      </div>
    </div>
  );
}
function PosterOnboarding({ onStart }) {
  const [step, setStep] = React.useState(0);
  const [income, setIncome] = React.useState(0);
  const [mode, setMode] = React.useState('once');
  const [accounts, setAccounts] = React.useState([]);
  const [plan, setPlan] = React.useState({});
  const [goal, setGoal] = React.useState({ name:'', amount:0 });
  const next = () => setStep(s => Math.min(5, s+1));
  const back = () => step > 0 && setStep(step - 1);

  if (step === 0) return <OnbWelcome onNext={() => setStep(1)}/>;
  if (step === 5) return <OnbDone income={income} accounts={accounts} plan={plan} goal={goal} onStart={onStart}/>;

  return (
    <div style={{ position:'absolute', inset:0 }}>
      {step === 1 && <OnbIncome income={income} setIncome={setIncome} mode={mode} setMode={setMode} onNext={next} onBack={back}/>}
      {step === 2 && <OnbAccounts accounts={accounts} setAccounts={setAccounts} onNext={next} onBack={back}/>}
      {step === 3 && <OnbPlan income={income} plan={plan} setPlan={setPlan} onNext={next} onBack={back}/>}
      {step === 4 && <OnbGoal goal={goal} setGoal={setGoal} onNext={next} onSkip={next} onBack={back}/>}
    </div>
  );
}

window.PosterScreens = {
  POSTER, POSTER_DATA, PosterTabBar,
  PosterHome, PosterTxn, PosterAi, PosterCategory, PosterMgmt,
  PosterAnalytics, PosterBudget, PosterSubs, PosterAddSheet, PosterOnboarding,
  PosterAccounts, PosterAccountDetail, PosterSavings,
};
