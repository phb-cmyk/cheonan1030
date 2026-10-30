/* Cheonan Wellness — dependency-free static web presentation */
(() => {
  'use strict';
  const slides = window.WELLNESS_SLIDES;
  if (!Array.isArray(slides) || slides.length !== 10) {
    document.body.textContent = '슬라이드 데이터를 불러오지 못했습니다. slides-data.js 파일을 확인해 주세요.';
    return;
  }
  const $ = (id) => document.getElementById(id);
  const els = {
    nav: $('chapterNav'), img: $('slideImage'), screen: $('stageScreen'), hotspots: $('hotspots'),
    eyebrow: $('sectionEyebrow'), tag: $('sectionTag'), page: $('screenPage'), current: $('currentNumber'),
    prev: $('prevButton'), next: $('nextButton'), dots: $('progressDots'), flash: $('slideFlash'),
    title: $('readingTitle'), intro: $('readingIntro'), kicker: $('readingKicker'), pill: $('readingPill'), cards: $('digestCards'),
    pop: $('detailPopover'), popCategory: $('detailCategory'), popTitle: $('detailTitle'), popMetric: $('detailMetric'),
    popBody: $('detailBody'), popChart: $('detailChart'), popFoot: $('detailFootnote'),
    overview: $('overviewDialog'), overviewGrid: $('overviewGrid'), notes: $('notesDialog'),
    notesNum: $('notesSlideNum'), notesBody: $('notesTabBody'), notesSub: $('notesSubtitle'), sourcesCount: $('sourcesCount'),
    zoom: $('zoomDialog'), zoomImage: $('zoomImage'), zoomTitle: $('zoomTitle'), zoomArea: $('zoomArea'), zoomLevel: $('zoomLevel')
  };
  let index = 0;
  let selectedCard = -1;
  let tab = 'notes';
  let lastFocused = null;
  let wheelLock = 0;
  let pointerStart = null;
  let zoomScale = 1, offsetX = 0, offsetY = 0, zoomDrag = null;
  let toastTimer;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad2 = (i) => String(i).padStart(2, '0');
  const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isVisible = (el) => el && !el.hidden;
  const localHash = () => {
    const match = location.hash.match(/^#slide-(\d{1,2})$/);
    return match ? Math.min(9, Math.max(0, Number(match[1]) - 1)) : 0;
  };
  function createNav() {
    slides.forEach((s, i) => {
      const button = document.createElement('button');
      button.type = 'button';button.className = 'chapter-tab';
      button.innerHTML = `<span>${pad2(i + 1)}</span>${escapeHTML(s.short)}`;
      button.setAttribute('aria-label', `${i + 1}번 슬라이드: ${s.title}`);
      button.addEventListener('click', () => goTo(i));
      els.nav.appendChild(button);
      const dot = document.createElement('button');
      dot.type = 'button';dot.className = 'progress-dot';
      dot.setAttribute('aria-label', `${i + 1}번 슬라이드로 이동`);
      dot.addEventListener('click', () => goTo(i));
      els.dots.appendChild(dot);
    });
  }
  function createOverview() {
    slides.forEach((s, i) => {
      const button = document.createElement('button');
      button.type = 'button';button.className = 'overview-card';
      button.innerHTML = `<img src="${s.image}" alt="${escapeHTML(s.title)}의 축소 이미지" loading="lazy" width="448" height="252"><div><strong>${escapeHTML(s.short)}</strong><span>${pad2(i+1)} / 10</span></div>`;
      button.addEventListener('click', () => { closeDialog('overviewDialog'); goTo(i); els.screen.focus({preventScroll:true}); });
      els.overviewGrid.appendChild(button);
    });
  }
  function preloadNeighborImages(i) {
    [i - 1, i + 1].filter((n) => n >= 0 && n < slides.length).forEach((n) => {
      const p = new Image();p.src = slides[n].image;
    });
  }
  function revealCards() {
    [...els.cards.children].forEach((el, i) => {
      el.classList.remove('is-visible');
      if (reduceMotion) { el.classList.add('is-visible');return; }
      setTimeout(() => el.classList.add('is-visible'), 45 + 45 * i);
    });
  }
  function renderDigest(s) {
    els.cards.replaceChildren();
    for (const [i, card] of s.cards.entries()) {
      const button = document.createElement('button');
      button.type = 'button';button.className = 'digest-card reveal';
      button.setAttribute('aria-label', `${card.head} 상세 내용 보기`);
      button.innerHTML = `<span class="card-label">${escapeHTML(card.tag)}</span><strong>${escapeHTML(card.head)}</strong>${card.metric ? `<span class="digest-metric">${escapeHTML(card.metric)}</span>` : ''}<span class="digest-body">${escapeHTML(card.body)}</span>`;
      button.addEventListener('click', () => {
        openDetail(i);
        if (window.innerWidth > 750) els.screen.scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'center'});
      });
      els.cards.appendChild(button);
    }
    revealCards();
  }
  function renderHotspots(s) {
    els.hotspots.replaceChildren();
    s.cards.forEach((card, i) => {
      const b = document.createElement('button');
      b.type = 'button';b.className='hotspot';
      b.style.left = card.x + '%';b.style.top=card.y + '%';b.style.width=card.w + '%';b.style.height=card.h + '%';
      b.setAttribute('aria-label', `${card.head}의 상세 설명 열기`);
      b.title = `${card.head} · 클릭하여 상세 보기`;
      b.innerHTML = `<span class="hotspot-icon" aria-hidden="true">+</span><span class="hotspot-tag" aria-hidden="true">${escapeHTML(card.head)}</span>`;
      b.addEventListener('click', () => { selectedCard === i && !els.pop.hidden ? closeDetail() : openDetail(i); });
      els.hotspots.appendChild(b);
    });
  }
  function markActive() {
    [...els.nav.children].forEach((el, i) => {
      el.classList.toggle('active', i === index);
      if (i === index) el.setAttribute('aria-current', 'page');else el.removeAttribute('aria-current');
    });
    [...els.dots.children].forEach((el, i) => el.classList.toggle('active', i === index));
    [...els.overviewGrid.children].forEach((el, i) => el.classList.toggle('active', i === index));
    const active = els.nav.children[index];
    if (active) active.scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'nearest',inline:'nearest'});
  }
  function goTo(target, opts = {}) {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, target));
    if (index === nextIndex && opts.skipSame) return;
    index = nextIndex;
    const s = slides[index];
    closeDetail();
    els.img.src = s.image;
    els.img.alt = `슬라이드 ${s.number}: ${s.title}. 이 슬라이드의 자세한 원문과 출처는 발표 자료 버튼에서 확인할 수 있습니다.`;
    els.img.classList.remove('change');
    void els.img.offsetWidth;
    if (!reduceMotion) els.img.classList.add('change');
    els.flash.classList.remove('flash');void els.flash.offsetWidth;if (!reduceMotion) els.flash.classList.add('flash');
    els.eyebrow.textContent = s.category;els.tag.textContent = s.tag;
    els.page.textContent = pad2(s.number);els.current.textContent = pad2(s.number);
    els.kicker.textContent = 'SLIDE ' + pad2(s.number);els.pill.textContent = s.tag;
    els.title.textContent = s.title;els.intro.textContent = s.intro;
    renderHotspots(s);renderDigest(s);markActive();
    els.prev.disabled = index === 0;els.next.disabled = index === slides.length - 1;
    $('notesPrev').disabled = index === 0;$('notesNext').disabled = index === slides.length - 1;
    if (isVisible(els.notes)) renderNotes();
    if (isVisible(els.zoom)) {els.zoomImage.src=s.image;els.zoomTitle.textContent = `${pad2(s.number)} / 10 · ${s.short}`;resetZoom();}
    preloadNeighborImages(index);
    if (!opts.noHash) history.replaceState(null, '', '#slide-' + s.number);
    if (opts.scrollTop) window.scrollTo({top:0,behavior:reduceMotion?'instant':'smooth'});
    document.title = `${s.short} (${s.number}/10) | 천안 웰니스`;
  }
  function miniChart() {
    return `<div class="mini-chart" role="img" aria-label="흥타령춤축제 방문객 2025년 89.2만 명, 2026년 잠정 99.2만 명"><div class="mini-bar-group"><strong>89.2만</strong><div class="mini-bar" style="height:82%"></div><span>2025</span></div><div class="mini-bar-group"><strong>99.2만*</strong><div class="mini-bar" style="height:92%"></div><span>2026*</span></div></div>`;
  }
  function openDetail(cardIndex) {
    const s = slides[index];const card = s.cards[cardIndex];if (!card) return;
    selectedCard = cardIndex;
    [...els.hotspots.children].forEach((el,i) => el.classList.toggle('active',i===cardIndex));
    els.popCategory.textContent = card.tag;
    els.popTitle.textContent = card.head;
    els.popBody.textContent = card.body;
    els.popMetric.textContent = card.metric || '';
    els.popMetric.hidden = !card.metric;
    els.popFoot.textContent = s.number >= 9 ? '전략·로드맵은 제안이며 확정 사업이 아닙니다.' : (index === 7 ? '서로 다른 프로그램 지표를 직접 합산·비교하지 않습니다.' : '원본 PPTX 자료에 기초한 설명입니다.');
    els.popChart.innerHTML = card.chart === 'festival' ? miniChart() : '';
    els.pop.hidden = false;
  }
  function closeDetail() {
    selectedCard = -1;els.pop.hidden = true;
    [...els.hotspots.children].forEach(el => el.classList.remove('active'));
  }
  function setModalState(open) { document.body.style.overflow = open ? 'hidden' : ''; }
  function openDialog(id) {
    lastFocused = document.activeElement;
    closeDetail();
    for (const dialogId of ['overviewDialog','notesDialog','zoomDialog']) $(dialogId).hidden = true;
    $(id).hidden = false;setModalState(true);
    if (id === 'notesDialog') {tab='notes';renderNotes();}
    if (id === 'zoomDialog') {els.zoomImage.src=slides[index].image;els.zoomTitle.textContent=`${pad2(index+1)} / 10 · ${slides[index].short}`;resetZoom();}
    setTimeout(() => {const close=$(id).querySelector('.dialog-close,.zoom-close');if(close) close.focus({preventScroll:true});},0);
  }
  function closeDialog(id) {
    $(id).hidden = true;
    if (![els.overview,els.notes,els.zoom].some(isVisible)) setModalState(false);
    if (lastFocused?.isConnected) lastFocused.focus({preventScroll:true});
  }
  function renderNotes() {
    const s=slides[index];els.notesNum.textContent=`SLIDE ${pad2(s.number)} / 10`;els.notesSub.textContent=s.title;
    els.sourcesCount.textContent = s.sources.length ? `(${s.sources.length})` : '(0)';
    document.querySelectorAll('[data-tab]').forEach((b) => {
      const selected=b.dataset.tab===tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));
    });
    els.notesBody.replaceChildren();
    if (tab==='notes') {
      const h=document.createElement('h3');h.textContent='원본 발표자 노트';els.notesBody.appendChild(h);
      const p=document.createElement('p');p.textContent=s.speakerNotes || '별도의 발표자 노트가 없습니다.';els.notesBody.appendChild(p);
      const caveat=document.createElement('div');caveat.className='note-caveat';caveat.textContent='검증 및 구분: 공개자료 기준. ‘제안’ 문구는 추진 확정 정책·예산을 의미하지 않음.';els.notesBody.appendChild(caveat);
    } else if (tab==='text') {
      const h=document.createElement('h3');h.textContent='원본 슬라이드 전체 텍스트';els.notesBody.appendChild(h);
      const div=document.createElement('div');div.className='original-text';div.textContent=s.transcript;els.notesBody.appendChild(div);
    } else {
      const h=document.createElement('h3');h.textContent='슬라이드별 원본 참고 자료';els.notesBody.appendChild(h);
      if (!s.sources.length) {
        const p=document.createElement('p');p.textContent='원본 발표자 노트에 별도로 기재된 외부 출처 링크는 없습니다.';els.notesBody.appendChild(p);
      } else {
        const list=document.createElement('ul');list.className='source-list';
        s.sources.forEach((url,i) => {
          const li=document.createElement('li'),a=document.createElement('a');
          a.href=url;a.target='_blank';a.rel='noopener noreferrer';
          let domain='참고 자료';try{domain=new URL(url).hostname}catch(_e){}
          a.innerHTML=`<div><span>REFERENCE ${pad2(i+1)} · ${escapeHTML(domain)}</span>${escapeHTML(url)}</div><span class="external-arrow" aria-hidden="true">↗</span>`;
          li.appendChild(a);list.appendChild(li);
        });els.notesBody.appendChild(list);
      }
      const caveat=document.createElement('div');caveat.className='note-caveat';caveat.textContent='링크는 원본 PPTX 발표자 노트에 포함된 주소를 그대로 옮겼습니다. 외부 사이트 운영과 최신 변경 내용은 각 기관에서 확인해 주세요.';els.notesBody.appendChild(caveat);
    }
    els.notesBody.scrollTop=0;
    $('notesPrev').disabled=index===0;$('notesNext').disabled=index===slides.length-1;
  }
  function resetZoom() {zoomScale=1;offsetX=0;offsetY=0;applyZoom()}
  function applyZoom() {
    els.zoomImage.style.transform=`translate(${offsetX}px,${offsetY}px) scale(${zoomScale})`;
    els.zoomLevel.textContent=Math.round(zoomScale*100)+'%';
  }
  function zoomBy(factor) {
    zoomScale=Math.max(1,Math.min(5,zoomScale*factor));
    if(zoomScale===1){offsetX=0;offsetY=0;}
    applyZoom();
  }
  function showToast(message) {
    const toast=$('toast');toast.textContent=message;toast.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,2100);
  }
  function attachEvents() {
    els.prev.addEventListener('click',()=>goTo(index-1,{skipSame:true}));
    els.next.addEventListener('click',()=>goTo(index+1,{skipSame:true}));
    $('detailClose').addEventListener('click',closeDetail);
    $('overviewOpen').addEventListener('click',()=>openDialog('overviewDialog'));
    ['notesOpen','notesSecondary','asideNotes'].forEach(id=>$(id).addEventListener('click',()=>openDialog('notesDialog')));
    ['zoomOpen'].forEach(id=>$(id).addEventListener('click',()=>openDialog('zoomDialog')));
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
    [els.overview,els.notes,els.zoom].forEach(d => d.addEventListener('click',(ev)=>{if(ev.target===d)closeDialog(d.id)}));
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;renderNotes()}));
    $('notesPrev').addEventListener('click',()=>goTo(index-1));
    $('notesNext').addEventListener('click',()=>goTo(index+1));
    $('backToTop').addEventListener('click',()=>goTo(0,{scrollTop:true}));
    $('fullscreenButton').addEventListener('click', async()=>{
      try {if(!document.fullscreenElement){await els.screen.requestFullscreen();}else{await document.exitFullscreen();}}
      catch(_e){openDialog('zoomDialog');}
    });
    $('zoomIn').addEventListener('click',()=>zoomBy(1.35));
    $('zoomOut').addEventListener('click',()=>zoomBy(1/1.35));
    $('zoomReset').addEventListener('click',resetZoom);
    els.zoomArea.addEventListener('dblclick',()=>zoomScale===1?zoomBy(2):resetZoom());
    els.zoomArea.addEventListener('wheel',(ev)=>{ev.preventDefault();zoomBy(ev.deltaY<0?1.12:1/1.12)},{passive:false});
    els.zoomArea.addEventListener('pointerdown',(ev)=>{
      if(ev.pointerType==='mouse' && ev.button!==0)return;
      zoomDrag={x:ev.clientX,y:ev.clientY,ox:offsetX,oy:offsetY};
      els.zoomArea.setPointerCapture(ev.pointerId);els.zoomArea.classList.add('dragging');
    });
    els.zoomArea.addEventListener('pointermove',(ev)=>{
      if(!zoomDrag || zoomScale===1)return;
      offsetX=zoomDrag.ox+ev.clientX-zoomDrag.x;offsetY=zoomDrag.oy+ev.clientY-zoomDrag.y;applyZoom();
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>els.zoomArea.addEventListener(type,()=>{zoomDrag=null;els.zoomArea.classList.remove('dragging')}));
    els.screen.addEventListener('wheel',(ev)=>{
      if(ev.ctrlKey||ev.metaKey||isVisible(els.pop)||document.fullscreenElement)return;
      if(Math.abs(ev.deltaY)<12 || Math.abs(ev.deltaX)>Math.abs(ev.deltaY))return;
      ev.preventDefault();
      const now=performance.now();if(now-wheelLock<750)return;
      const delta=ev.deltaY>0?1:-1;
      if ((delta<0 && index===0)||(delta>0&&index===slides.length-1))return;
      wheelLock=now;goTo(index+delta);
    },{passive:false});
    els.screen.addEventListener('pointerdown',(ev)=>{
      if(ev.pointerType!=='touch' || isVisible(els.pop))return;
      pointerStart={x:ev.clientX,y:ev.clientY,time:Date.now()};
    });
    els.screen.addEventListener('pointerup',(ev)=>{
      if(!pointerStart || ev.pointerType!=='touch')return;
      const dx=ev.clientX-pointerStart.x,dy=ev.clientY-pointerStart.y;
      if (Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.45)goTo(index+(dx<0?1:-1));
      pointerStart=null;
    });
    window.addEventListener('hashchange',()=>goTo(localHash(),{noHash:true,skipSame:true}));
    window.addEventListener('keydown',(ev)=>{
      const target=ev.target;const editing=target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
      if(editing||ev.altKey||ev.ctrlKey||ev.metaKey)return;
      const dialogOpen=[els.overview,els.notes,els.zoom].some(isVisible);
      if(ev.key==='Escape'){
        if(isVisible(els.zoom))closeDialog('zoomDialog');
        else if(isVisible(els.notes))closeDialog('notesDialog');
        else if(isVisible(els.overview))closeDialog('overviewDialog');
        else if(isVisible(els.pop))closeDetail();
        return;
      }
      if(dialogOpen){if(isVisible(els.notes)&&['ArrowRight','ArrowLeft'].includes(ev.key)){ev.preventDefault();goTo(index+(ev.key==='ArrowRight'?1:-1));}return;}
      const key=ev.key;
      if (key===' ' && target?.closest('button,a,[role=tab]')) return;
      if(['ArrowRight','PageDown',' '].includes(key)){ev.preventDefault();goTo(index+1,{skipSame:true});}
      else if(['ArrowLeft','PageUp'].includes(key)){ev.preventDefault();goTo(index-1,{skipSame:true});}
      else if(key==='Home'){ev.preventDefault();goTo(0);}
      else if(key==='End'){ev.preventDefault();goTo(slides.length-1);}
      else if(key.toLowerCase()==='o')openDialog('overviewDialog');
      else if(key.toLowerCase()==='n')openDialog('notesDialog');
      else if(key.toLowerCase()==='f')$('fullscreenButton').click();
    });
  }
  createNav();createOverview();attachEvents();goTo(localHash(),{noHash:!location.hash});
})();
