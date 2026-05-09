// poster-app.jsx — navigation shell + iOS frame for Maximal Poster prototype

const { POSTER, POSTER_DATA, PosterTabBar,
  PosterHome, PosterTxn, PosterAi, PosterCategory, PosterMgmt,
  PosterAnalytics, PosterBudget, PosterSubs, PosterAddSheet, PosterOnboarding,
  PosterAccounts, PosterAccountDetail, PosterSavings } = window.PosterScreens;
const { TweaksPanel, TweakSection, TweakRadio, useTweaks } = window;

// ─────────── iOS device frame (inline, minimal) ───────────
function PosterDevice({ children, dark = true }) {
  return (
    <div style={{
      width:390, height:844, borderRadius:48, overflow:'hidden', position:'relative',
      background:'#000', boxShadow:'0 40px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)',
    }}>
      {/* dynamic island */}
      <div style={{ position:'absolute', top:11, left:'50%', transform:'translateX(-50%)',
        width:126, height:37, borderRadius:24, background:'#000', zIndex:80 }}/>
      {/* status bar */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:54, zIndex:60,
        display:'flex', justifyContent:'space-between', alignItems:'center', padding:'21px 30px 0',
        fontFamily:'-apple-system, "SF Pro", system-ui', fontWeight:600, fontSize:15,
        color: dark ? '#fff' : '#000', pointerEvents:'none' }}>
        <span>9:41</span>
        <span style={{ display:'flex', gap:5, alignItems:'center', fontSize:13 }}>●●● ◐ ▮</span>
      </div>
      {/* content */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>{children}</div>
      {/* home indicator */}
      <div style={{ position:'absolute', bottom:6, left:'50%', transform:'translateX(-50%)',
        width:139, height:5, borderRadius:3, zIndex:300,
        background: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.4)' }}/>
    </div>
  );
}

// ─────────── slide-up sheet ───────────
function Sheet({ open, children, onClose }) {
  const [mounted, setMounted] = React.useState(open);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 280);
      return () => clearTimeout(t);
    }
  }, [open]);
  if (!mounted) return null;
  return (
    <div style={{ position:'absolute', inset:0, zIndex:300 }}>
      <div onClick={onClose} style={{
        position:'absolute', inset:0,
        background: visible ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
        transition:'background .28s',
      }}/>
      <div style={{
        position:'absolute', left:0, right:0, bottom:0, top:60,
        transform: visible ? 'translateY(0)' : 'translateY(110%)',
        transition:'transform .35s cubic-bezier(0.32,0.72,0,1)',
      }}>{children}</div>
    </div>
  );
}

// ─────────── toast ───────────
function PosterToast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ position:'absolute', top:64, left:0, right:0, display:'flex', justifyContent:'center', zIndex:400, pointerEvents:'none', animation:'posterToastIn2 .5s cubic-bezier(0.34,1.56,0.64,1)' }}>
      <div style={{ padding:'10px 14px', background:POSTER.yellow, color:POSTER.ink,
        fontFamily:'Archivo Black', fontSize:11, letterSpacing:'0.16em',
        display:'flex', alignItems:'center', gap:8 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M4 12 L10 18 L20 6" stroke={POSTER.ink} strokeWidth="3" strokeLinecap="square"
            style={{ strokeDasharray:24, strokeDashoffset:24, animation:'posterCheck .35s cubic-bezier(0.22,0.61,0.36,1) .12s forwards' }}/>
        </svg>
        {msg}
      </div>
    </div>
  );
}

// ─────────── App ───────────
function PosterApp() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('onboarding');
  const [acc, setAcc] = React.useState(null);
  const [cat, setCat] = React.useState(null);
  const [txnFilter, setTxnFilter] = React.useState('Все');
  const [sheet, setSheet] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [dir, setDir] = React.useState('fwd'); // 'fwd' | 'back' | 'tab'
  const stackRef = React.useRef(['onboarding']);

  const navFwd = (s) => { stackRef.current.push(s); setDir('fwd'); setScreen(s); };
  const navBack = () => {
    if (stackRef.current.length > 1) stackRef.current.pop();
    const prev = stackRef.current[stackRef.current.length - 1] || 'home';
    setDir('back'); setScreen(prev);
  };
  const navTab = (s) => { stackRef.current = [s]; setDir('tab'); setScreen(s); };

  const showToast = m => { setToast(m); setTimeout(() => setToast(null), 1700); };

  const homeColor = t.homeColor || 'coral';

  // determine dark for tabbar
  const darkScreens = { home: homeColor !== 'cream', txn:true, ai:false, mgmt:true, analytics:false, budget:true, subs:true, category:true };
  const dark = darkScreens[screen];

  let activeTab = null;
  if (screen === 'home') activeTab = 'home';
  else if (screen === 'txn') activeTab = null;
  else if (screen === 'ai') activeTab = 'ai';
  else if (['savings'].includes(screen)) activeTab = 'savings';
  else if (['mgmt','analytics','budget','subs','accounts','accDetail'].includes(screen)) activeTab = 'mgmt';

  let content;
  if (screen === 'onboarding') {
    content = <PosterOnboarding onStart={() => navTab('home')}/>;
  } else if (screen === 'home') {
    content = <PosterHome
      homeColor={homeColor}
      onCat={(id) => { setCat(id); navFwd('category'); }}
      onMgmt={() => navFwd('mgmt')}
      onPlan={() => navFwd('budget')}
      onTxn={() => navFwd('txn')}
      onAccounts={() => navFwd('accounts')}
    />;
  } else if (screen === 'txn') {
    content = <PosterTxn filter={txnFilter} setFilter={setTxnFilter}/>;
  } else if (screen === 'ai') {
    content = <PosterAi/>;
  } else if (screen === 'category') {
    content = <PosterCategory catId={cat} onBack={navBack}/>;
  } else if (screen === 'mgmt') {
    content = <PosterMgmt
      onAnalytics={() => navFwd('analytics')}
      onBudget={() => navFwd('budget')}
      onAccounts={() => navFwd('accounts')}
    />;
  } else if (screen === 'analytics') {
    content = <PosterAnalytics onBack={navBack}/>;
  } else if (screen === 'budget') {
    content = <PosterBudget onBack={navBack} onCat={(id) => { setCat(id); navFwd('category'); }} onSubs={() => navFwd('subs')}/>;
  } else if (screen === 'subs') {
    content = <PosterSubs onBack={navBack}/>;
  } else if (screen === 'accounts') {
    content = <PosterAccounts onBack={navBack} onAcc={(id) => { setAcc(id); navFwd('accDetail'); }}/>;
  } else if (screen === 'accDetail') {
    content = <PosterAccountDetail accId={acc} onBack={navBack}/>;
  } else if (screen === 'savings') {
    content = <PosterSavings onBack={navBack}/>;
  }

  const onTab = (id) => {
    if (id === 'home') { navTab('home'); }
    else if (id === 'savings') { navTab('savings'); }
    else if (id === 'ai') { navTab('ai'); }
    else if (id === 'mgmt') { navTab('mgmt'); }
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'40px 20px', gap:30 }}>
      <style>{`
        @keyframes posterToastIn { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes posterDot { 0%,80%,100% { opacity:0.3; transform:translateY(0) } 40% { opacity:1; transform:translateY(-3px) } }
        @keyframes posterFade { from { opacity:0 } to { opacity:1 } }
        @keyframes posterSlideInFwd { from { opacity:0; transform:translate3d(28px,0,0) } to { opacity:1; transform:translate3d(0,0,0) } }
        @keyframes posterSlideInBack { from { opacity:0; transform:translate3d(-28px,0,0) } to { opacity:1; transform:translate3d(0,0,0) } }
        @keyframes posterTabSwap { 0% { opacity:0; transform:translate3d(0,8px,0) } 100% { opacity:1; transform:translate3d(0,0,0) } }
        @keyframes posterRowIn { from { opacity:0; transform:translate3d(0,8px,0) } to { opacity:1; transform:none } }
        @keyframes posterBarFill { from { transform:scaleX(0) } to { transform:scaleX(1) } }
        @keyframes posterTabPop { 0% { transform:scale(1) } 35% { transform:scale(1.35) translateY(-2px) } 100% { transform:scale(1) } }
        @keyframes posterPopIn { 0% { opacity:0; transform:scale(0.86) } 60% { opacity:1; transform:scale(1.04) } 100% { opacity:1; transform:scale(1) } }
        @keyframes posterRiseIn { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        @keyframes posterToastIn2 { 0% { opacity:0; transform:translateY(-8px) scale(0.9) } 60% { opacity:1; transform:translateY(2px) scale(1.04) } 100% { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes posterCheck { from { stroke-dashoffset:24 } to { stroke-dashoffset:0 } }
        .poster-press { transition:transform .15s ease; }
        .poster-press:active { transform:scale(0.97); }
        input[type="range"] { -webkit-appearance:none; appearance:none; background:transparent; }
        input[type="range"]::-webkit-slider-runnable-track { height:2px; background:rgba(255,246,232,0.35); border:0; }
        input[type="range"]::-moz-range-track            { height:2px; background:rgba(255,246,232,0.35); border:0; }
        input[type="range"]::-webkit-slider-thumb {
          appearance:none; -webkit-appearance:none;
          width:22px; height:22px; margin-top:-10px;
          background:#FFF6E8; border-radius:50%; border:0;
          box-shadow:0 2px 6px rgba(0,0,0,0.25);
          cursor:grab;
        }
        input[type="range"]:active::-webkit-slider-thumb { cursor:grabbing; transform:scale(1.08); }
        input[type="range"]::-moz-range-thumb {
          width:22px; height:22px; background:#FFF6E8; border:0; border-radius:50%;
          box-shadow:0 2px 6px rgba(0,0,0,0.25);
        }
      `}</style>

      {/* left rail */}
      <div style={{ width:170, color:'#cbd0db', fontFamily:'Manrope', fontSize:12, alignSelf:'flex-start', paddingTop:40 }}>
        <div style={{ fontFamily:'Archivo Black', fontSize:13, letterSpacing:'0.14em', color:'#fff', marginBottom:12 }}>MAXIMAL POSTER</div>
        <div style={{ lineHeight:1.55, opacity:0.7, fontSize:11 }}>
          • Кликни строки в Главной — детали категории<br/>
          • [+] — записать трату<br/>
          • Чипы в Реестре — фильтр<br/>
          • Подсказки в AI — диалог<br/>
          • МЕНЮ ↗ — управление
        </div>
        <div style={{ marginTop:18, padding:10, border:'1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize:9, fontFamily:'JetBrains Mono', opacity:0.6, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:6 }}>СЕЙЧАС</div>
          <div style={{ color:'#fff', fontFamily:'Archivo Black', fontSize:13, letterSpacing:'0.04em' }}>
            {{
              onboarding:'ОНБОРДИНГ',
              home:`ГЛАВНАЯ · ${homeColor.toUpperCase()}`,
              txn:'РЕЕСТР',
              ai:'AI',
              category:`КАТЕГОРИЯ · ${(cat||'').toUpperCase()}`,
              mgmt:'УПРАВЛЕНИЕ',
              analytics:'АНАЛИТИКА',
              budget:'PLAN МАЯ',
              subs:'ПОДПИСКИ',
            }[screen]}
          </div>
        </div>
      </div>

      {/* device */}
      <div style={{ position:'relative' }}>
        <PosterDevice dark={dark}>
          <div key={`${screen}-${cat}-${acc}`} style={{
            position:'absolute', inset:0, willChange:'transform,opacity',
            animation: dir === 'back'
              ? 'posterSlideInBack .42s cubic-bezier(0.22,0.61,0.36,1)'
              : dir === 'tab'
                ? 'posterTabSwap .35s cubic-bezier(0.22,0.61,0.36,1)'
                : 'posterSlideInFwd .42s cubic-bezier(0.22,0.61,0.36,1)',
          }}>
            {content}
          </div>
          {activeTab && (
            <PosterTabBar
              active={activeTab} dark={dark}
              onTab={onTab}
              onFab={() => setSheet('add')}
            />
          )}

          <Sheet open={sheet === 'add'} onClose={() => setSheet(null)}>
            <PosterAddSheet
              onClose={() => setSheet(null)}
              onSave={({ name }) => { setSheet(null); showToast(`Записано: ${name}`); }}
            />
          </Sheet>

          <PosterToast msg={toast}/>
        </PosterDevice>
      </div>

      {/* right rail — quick jumps */}
      <div style={{ width:160, alignSelf:'flex-start', paddingTop:40, display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.14em', fontFamily:'JetBrains Mono', fontWeight:700, marginBottom:4 }}>ПЕРЕЙТИ</div>
        {[
          { id:'onboarding', l:'Онбординг' },
          { id:'home',       l:'Главная' },
          { id:'txn',        l:'Реестр' },
          { id:'ai',         l:'AI' },
          { id:'mgmt',       l:'Управление' },
          { id:'analytics',  l:'Аналитика' },
          { id:'budget',     l:'PLAN мая' },
          { id:'subs',       l:'Подписки' },
        ].map(s => (
          <div key={s.id} onClick={() => navTab(s.id)} style={{
            padding:'9px 12px', cursor:'pointer',
            background: screen === s.id ? POSTER.yellow : 'transparent',
            color: screen === s.id ? POSTER.ink : '#fff',
            border: screen === s.id ? `1px solid ${POSTER.yellow}` : '1px solid rgba(255,255,255,0.12)',
            fontFamily:'Archivo Black', fontSize:10, letterSpacing:'0.14em',
            transition:'all .15s',
          }}>{s.l.toUpperCase()}</div>
        ))}
        <div onClick={() => setSheet('add')} style={{
          marginTop:8, padding:'10px 12px', cursor:'pointer',
          background:POSTER.coral, color:'#fff',
          fontFamily:'Archivo Black', fontSize:10, letterSpacing:'0.14em',
        }}>+ НОВАЯ ТРАТА</div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Цвет главной">
          <TweakRadio value={t.homeColor} options={[
            { value:'coral',  label:'Коралл' },
            { value:'cobalt', label:'Кобальт' },
            { value:'cream',  label:'Крем' },
          ]} onChange={v => setTweak('homeColor', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PosterApp/>);
