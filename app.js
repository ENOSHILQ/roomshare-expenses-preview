import { makeBackend } from './backend.js';

const config=window.ROOMSHARE_CONFIG||{};
const content=document.getElementById('content'),nav=document.getElementById('nav'),fab=document.getElementById('fab');
const dialog=document.getElementById('dialog'),sheet=document.getElementById('sheet');
const state={backend:null,user:null,groups:[],group:null,members:[],expenses:[],tab:'home',inviteUrl:'',error:'',message:'',busy:false,unsub:null,interval:null,emailAwaiting:''};
const STORE_INVITE='roomshare.v08.invitation';
const STORE_INVITE_RECOVERY='roomshare.v08.invite_recovery';
const INVITE_RECOVERY_MS=20*60*1000;
function getPendingInvite(){
  const s=sessionStorage.getItem(STORE_INVITE);
  if(s && /^[0-9a-f]{48}$/.test(s))return s;
  try{
    const item=JSON.parse(localStorage.getItem(STORE_INVITE_RECOVERY)||'null');
    if(item && /^[0-9a-f]{48}$/.test(item.token) && item.expires>Date.now()){
      sessionStorage.setItem(STORE_INVITE,item.token);return item.token;
    }
  }catch(_e){}
  localStorage.removeItem(STORE_INVITE_RECOVERY);
  return null;
}
function clearPendingInvite(){sessionStorage.removeItem(STORE_INVITE);localStorage.removeItem(STORE_INVITE_RECOVERY);}

const STORE_GROUP='roomshare.v07.active_group';
const INV=/^[0-9a-f]{48}$/;
const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v||0);
const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
function extractInvite(){
  const url=new URL(location.href),tok=url.searchParams.get('invite');
  if(tok && INV.test(tok)){sessionStorage.setItem(STORE_INVITE,tok);localStorage.setItem(STORE_INVITE_RECOVERY,JSON.stringify({token:tok,expires:Date.now()+INVITE_RECOVERY_MS}));}
  if(url.searchParams.has('invite')){url.searchParams.delete('invite');history.replaceState({},'',url.pathname+url.search+url.hash);}
}
extractInvite();
function alertMarkup(){return `${state.error?`<div class="err" role="alert">${esc(state.error)}</div>`:''}${state.message?`<div class="notice" role="status">${esc(state.message)}</div>`:''}`;}
function statusBusy(yes){state.busy=yes;document.querySelectorAll('button[data-action]').forEach(b=>{if(b.dataset.action!=='dismiss')b.disabled=yes;});}
async function task(fn){if(state.busy)return;statusBusy(true);state.error='';state.message='';try{await fn();}catch(e){state.error=e.message||String(e);}finally{statusBusy(false);render();}}
function loginView(){
  const demo=state.backend?.mode==='demo';
  const googleEnabled=!!config.googleOAuthReady;
  const emailEnabled=!!config.emailOtpReady;
  const otp=state.emailAwaiting;
  content.innerHTML=`<h1>共同生活費を、みんなで。</h1><p class="muted">自分の負担額と支払い状況を、同じグループで共有します。</p>
  ${alertMarkup()}${getPendingInvite()?'<div class="notice">招待リンクを確認しました。ログイン後に参加確認画面へ戻ります。</div>':''}
  <div class="card"><h2>${demo?'ローカルテスト用ログイン':'アカウントでログイン'}</h2>
  ${demo?'<div class="info">この画面はローカル専用デモです。Aさん・Bさんは架空のアカウントです。</div><div class="buttons"><button class="btn block" data-action="demo-a">Aさんとして開く</button><button class="btn alt block" data-action="demo-b">Bさんとして開く</button></div>':
  `${otp?`<div class="notice">${esc(otp)} に認証コードの送信を要求しました。</div><form id="email-verify-form"><div class="field"><label for="email-verify-token">メールに記載された認証コード</label><input class="input" id="email-verify-token" type="text" inputmode="numeric" pattern="[0-9]{6,8}" minlength="6" maxlength="8" autocomplete="one-time-code" placeholder="6～8桁の数字" required></div><button class="btn block" type="submit">コードを確認してログイン</button></form><button class="btn ghost block" data-action="email-restart" style="margin-top:10px">別のメールアドレスで試す</button>`:
  `<div class="buttons"><button class="btn block" data-action="google-login" ${googleEnabled?'':'disabled'}>Googleでログイン${googleEnabled?'':'（設定待ち）'}</button></div><form id="email-login-form"><div class="field"><label for="email-login">メールアドレス</label><input class="input" id="email-login" type="email" autocomplete="email" required placeholder="you@example.com" ${emailEnabled?'':'disabled'}></div><button class="btn alt block" type="submit" ${emailEnabled?'':'disabled'}>認証コードを受け取る${emailEnabled?'':'（設定待ち）'}</button></form>`}
  ${!googleEnabled||!emailEnabled?'<div class="info">このWeb版は開発用です。現在は認証プロバイダーの設定待ちです。Google CloudとSupabaseの設定後に利用できます。</div>':''}
  <p class="small">招待はログイン後に受諾します。ログインしただけではグループには参加しません。</p>`}</div>`;
  nav.classList.remove('visible');fab.classList.remove('visible');
}
function groupChooser(){
  const invite=!!getPendingInvite();
  content.innerHTML=`<h1>グループを選択</h1><p class="muted">${esc(state.user?.name)}さんのアカウント</p>${alertMarkup()}
  ${invite?'<div class="notice">受け取った招待があります。下の「招待を確認する」から進んでください。</div><button class="btn block" data-action="review-invite">招待を確認する</button>':''}
  ${state.groups.length?`<div class="card"><h2>参加中のグループ</h2>${state.groups.map(g=>`<div class="item row"><div><strong>${esc(g.name)}</strong><div class="small">${g.role==='owner'?'作成者':'メンバー'}</div></div><button class="btn alt" data-action="pick-group" data-id="${esc(g.id)}">開く</button></div>`).join('')}</div>`:''}
  <div class="card"><h2>新しくグループを作る</h2><form id="create-group-form"><div class="field"><label>グループ名</label><input class="input" name="name" maxlength="40" required placeholder="例：シェアハウス"></div><button class="btn block" type="submit">グループを作る</button></form></div>
  <div class="buttons"><button class="btn grey block" data-action="logout">ログアウト</button></div>`;
  nav.classList.remove('visible');fab.classList.remove('visible');
}
function pendingInviteView(preview){
  content.innerHTML=`<h1>グループへ参加</h1><p class="muted">共有する内容を確認してから参加します。</p>${alertMarkup()}
  <div class="card"><h2>${preview.valid?esc(preview.group_name):'利用できない招待'}</h2>
  <div class="sep"></div><p class="muted">${preview.valid?'このグループに参加すると、メンバーの支出登録を共有できます。':'招待の有効期限切れ、使用済み、または無効なリンクです。'}</p>
  ${preview.valid?'<button class="btn block" style="margin-top:16px" data-action="accept-invite">このグループに参加する</button>':''}
  </div><button class="btn ghost block" data-action="cancel-invite">キャンセルして戻る</button>`;
  nav.classList.remove('visible');fab.classList.remove('visible');
}
function splitCosts(){
  const members=state.members.slice().sort((a,b)=>a.id.localeCompare(b.id));
  const total=state.expenses.reduce((sum,e)=>sum+Number(e.amount||0),0);
  if(!members.length)return{total,shares:[],mine:0};
  const each=Math.floor(total/members.length),remainder=total%members.length;
  const shares=members.map((m,i)=>({id:m.id,name:m.id===state.user.id?'自分':m.name||'メンバー',due:each+(i<remainder?1:0),paid:state.expenses.filter(e=>e.user_id===m.id).reduce((a,e)=>a+Number(e.amount),0)}));
  const mine=shares.find(x=>x.id===state.user.id);
  return{total,shares,mine:mine?mine.due-mine.paid:0};
}
function homeView(){
  const s=splitCosts(),n=Math.max(1,state.members.length),mine=s.mine;
  return `<h1>${esc(state.group.name)}</h1><p class="muted">登録済みの立替支出をメンバー全員で共有します。</p>
  <div class="bigcard"><div class="muted">自分の負担差額（試算）</div><div class="amount">${yen(Math.abs(mine))}</div><div style="font-size:12px">${mine>0?'あなたが追加で負担する見込み':mine<0?'あなたが受け取る見込み':'現在の負担差額はありません'}</div></div>
  <div class="total"><div class="card"><div class="muted">共有生活費</div><div class="amount" style="font-size:21px">${yen(s.total)}</div></div><div class="card"><div class="muted">1人あたり目安</div><div class="amount" style="font-size:21px">${yen(Math.floor(s.total/n))}</div></div></div>
  <button class="btn block" style="margin:16px 0" data-action="add-expense">＋ 支出を追加</button>
  <div class="card"><div class="row"><h2>最近の支出</h2><span class="badge">${state.expenses.length}件</span></div>${expenseItems(state.expenses.slice(0,4))}</div>
  <div class="info" style="margin-top:156px">v0.7は個人立替の保存・共有を検証する段階です.共通資金・実送金・受領確認・月次確定はまだ接続していません。金額は確定した請求額ではありません。</div>`;
}
function expenseItems(entries){return entries.length?entries.map(e=>`<div class="item row"><div><strong>${esc(e.category)}</strong><div class="small">${esc(e.note||'内容未入力')} · ${esc(e.paid_on)} · ${esc(e.user_id===state.user.id?'自分':'ほかのメンバー')}</div></div><strong>${yen(e.amount)}</strong></div>`).join(''):'<p class="muted" style="margin-top:14px">まだ支出がありません。</p>';}
function expensesView(){return `<div class="row"><div><h1>支出</h1><p class="muted">グループ全員の立替記録</p></div><span class="badge">${state.expenses.length}件</span></div>
<div class="card">${expenseItems(state.expenses)}</div><div class="info">このテスト版では「自分が立て替えた支出」の追加だけ利用できます。過去支出の変更・削除は未接続です。</div>`;}
function settlementView(){const s=splitCosts();return `<h1>精算</h1><p class="muted">均等分担の計算イメージ</p><div class="card"><h2>メンバーごとの負担内訳</h2>${s.shares.map(x=>`<div class="item"><div class="row"><strong>${esc(x.name)}</strong><strong>${x.due-x.paid<0?'受取見込':'負担見込'} ${yen(Math.abs(x.due-x.paid))}</strong></div><div class="small">担当負担 ${yen(x.due)} ／ 立替済み ${yen(x.paid)}</div></div>`).join('')}</div><div class="info">試算の端数はメンバーID順に1円ずつ配分しています。本番の精算先・共同資金・送金申告・受領確認は未実装です。</div>`;}
function historyView(){return `<h1>履歴</h1><div class="card"><p>支出の保存と同期を優先して実装中です。</p><p class="muted">月次締め・確定済み履歴はまだ接続していません。</p></div>`;}
function settingsView(){return `<h1>設定</h1><p class="muted">共有グループの管理</p>${alertMarkup()}
<div class="card"><div class="row"><h2>${esc(state.group.name)}</h2><span class="badge">${state.group.role==='owner'?'作成者':'メンバー'}</span></div><div class="sep"></div><h2>参加者（${state.members.length}人）</h2>${state.members.map(m=>`<div class="item row"><span>${esc(m.id===state.user.id?'自分':m.name)}</span><span class="small">${m.role==='owner'?'作成者':'メンバー'}</span></div>`).join('')}
${state.group.role==='owner'?'<button class="btn alt block" style="margin-top:14px" data-action="create-invite">招待リンクを発行する</button>':''}
${state.inviteUrl?`<div class="notice"><strong>招待リンクを発行しました</strong><div class="link" id="invite-link">${esc(state.inviteUrl)}</div><div class="buttons"><button class="btn block" data-action="copy-invite">リンクをコピー</button><button class="btn ghost block" data-action="show-qr">QRコードを表示</button></div><div id="qr-slot"></div><p class="small">一度利用すると失効します。URLを公開SNSに投稿しないでください。</p></div>`:''}
</div><div class="card"><h2>アカウント</h2><p class="muted">${esc(state.user.name)}</p><div class="buttons"><button class="btn ghost block" data-action="switch-group">グループを切り替える</button><button class="btn grey block" data-action="logout">ログアウト</button></div></div>`;}
function render(){
  document.getElementById('mode-badge').textContent=state.backend?.mode==='demo'?'ローカルデモ':state.backend?.mode==='supabase'?(config.googleOAuthReady||config.emailOtpReady?'クラウド接続':'認証設定待ち'):'未接続';
  if(!state.backend){content.innerHTML=`<h1>接続が必要です</h1>${alertMarkup()}<p class="muted">config.js と起動方法を確認してください。</p>`;nav.classList.remove('visible');fab.classList.remove('visible');return;}
  if(!state.user){loginView();return;}
  if(state.pendingPreview){pendingInviteView(state.pendingPreview);return;}
  if(!state.group){groupChooser();return;}
  const layouts={home:homeView,expenses:expensesView,settlement:settlementView,history:historyView,settings:settingsView};
  content.innerHTML=`${state.tab!=='settings'?alertMarkup():''}${layouts[state.tab]()}`;
  nav.classList.add('visible');fab.classList.add('visible');
  for(const b of nav.querySelectorAll('button'))b.classList.toggle('active',b.dataset.tab===state.tab);
}
async function groupsRefresh(select){
  state.groups=await state.backend.groups();
  const remembered=localStorage.getItem(STORE_GROUP);
  const g=select?state.groups.find(x=>x.id===select):state.groups.find(x=>x.id===remembered);
  if(g)await selectGroup(g);
  else {state.group=null;state.members=[];state.expenses=[];if(state.unsub)state.unsub();state.unsub=null;}
}
async function selectGroup(g){
  if(state.unsub){state.unsub();state.unsub=null;}
  state.group=g;state.inviteUrl='';state.tab='home';localStorage.setItem(STORE_GROUP,g.id);
  await refreshData();
  state.unsub=state.backend.subscribe(g.id,refreshData);
  if(state.interval)clearInterval(state.interval);
  // Refetch on a bounded cadence even if realtime notification is missed.
  state.interval=setInterval(()=>{if(!document.hidden)void refreshData().then(render).catch(e=>console.warn('refresh',e));},10000);
}
async function refreshData(){
  const gid=state.group?.id;if(!gid)return;
  const [m,e]=await Promise.all([state.backend.members(gid),state.backend.expenses(gid)]);
  if(state.group?.id!==gid)return;
  state.members=m;state.expenses=e;render();
}
async function checkPendingInvite(){
  const tok=getPendingInvite();
  if(!tok||!state.user){state.pendingPreview=null;return;}
  state.pendingPreview=await state.backend.previewInvite(tok);
}
function closeSheet(){dialog.classList.remove('visible');dialog.setAttribute('aria-hidden','true');sheet.innerHTML='';fab.classList.toggle('visible',!!state.group);}
function openExpense(){
  if(!state.group)return;
  fab.classList.remove('visible');dialog.classList.add('visible');dialog.setAttribute('aria-hidden','false');
  sheet.innerHTML=`<div class="row"><h2>支出を追加</h2><button class="btn grey" type="button" data-action="dismiss">閉じる</button></div>
  <div class="notice">今回の接続テストでは、あなた自身が立て替えた金額を共有します。</div>
  <form id="expense-form"><div class="field"><label>金額（円）</label><input class="input" type="number" min="1" max="99999999" step="1" id="expense-amount" placeholder="例：3000" required inputmode="numeric"></div>
  <div class="field"><label>カテゴリー</label><select class="input" id="expense-category"><option>食費</option><option>日用品</option><option>光熱費</option><option>家賃</option><option>その他</option></select></div>
  <div class="field"><label>内容（任意）</label><input class="input" id="expense-note" maxlength="100" placeholder="例：洗剤とキッチンペーパー"></div>
  <div class="field"><label>日付</label><input type="date" class="input" id="expense-date" required value="${fmtDate()}"></div>
  <button class="btn block" type="submit">共有グループへ保存する</button></form>`;
  sheet.querySelector('#expense-amount').focus();
}
async function useInvite(){
 const tok=getPendingInvite();if(!tok)return;
 const gid=await state.backend.join(tok);clearPendingInvite();state.pendingPreview=null;
 await groupsRefresh(gid);state.message='グループへの参加が完了しました。';
}
async function copyLink(){
  if(!state.inviteUrl)return;
  await navigator.clipboard.writeText(state.inviteUrl);
  state.message='招待リンクをコピーしました';render();
}
async function showQRCode(){
  if(!state.inviteUrl)return;
  const target=document.getElementById('qr-slot');if(!target)return;
  target.innerHTML='<p class="small">QRコードを生成中…</p>';
  try{
    // QR image is generated locally in the browser. The invitation token is NOT sent to an image API.
    const {default: QRCode}=await import('https://esm.sh/qrcode@1.5.4');
    const canvas=document.createElement('canvas');await QRCode.toCanvas(canvas,state.inviteUrl,{width:188,margin:2,errorCorrectionLevel:'M'});
    target.innerHTML='';target.append(canvas);
  }catch(e){target.innerHTML='<p class="small">QR表示用ライブラリを読み込めませんでした。リンクのコピーをご利用ください。</p>';}
}
async function init(){
  try{
    state.backend=await makeBackend(config);
    state.user=await state.backend.session();
    if(state.user){await groupsRefresh();await checkPendingInvite();}
    render();
  }catch(e){state.error=e.message||String(e);render();}
}

document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-action], [data-tab]');if(!btn)return;
  const action=btn.dataset.action;
  if(btn.dataset.tab){if(state.group){state.tab=btn.dataset.tab;state.error='';state.message='';render();content.scrollTop=0;}return;}
  if(action==='dismiss'){closeSheet();return;}
  if(action==='add-expense'){openExpense();return;}
  if(action==='demo-a'||action==='demo-b')return void task(async()=>{state.user=await state.backend.demoLogin(action==='demo-a'?'Aさん':'Bさん');await groupsRefresh();await checkPendingInvite();});
  if(action==='google-login')return void task(()=>state.backend.googleLogin());
  if(action==='email-restart'){state.emailAwaiting='';state.error='';state.message='';render();return;}
  if(action==='logout')return void task(async()=>{await state.backend.logout();state.user=null;state.groups=[];state.group=null;state.pendingPreview=null;state.inviteUrl='';if(state.unsub)state.unsub();if(state.interval)clearInterval(state.interval);});
  if(action==='pick-group')return void task(()=>selectGroup(state.groups.find(x=>x.id===btn.dataset.id)));
  if(action==='switch-group')return void task(async()=>{localStorage.removeItem(STORE_GROUP);await groupsRefresh();state.group=null;});
  if(action==='review-invite')return void task(checkPendingInvite);
  if(action==='accept-invite')return void task(useInvite);
  if(action==='cancel-invite'){clearPendingInvite();state.pendingPreview=null;state.message='招待をキャンセルしました';render();return;}
  if(action==='create-invite')return void task(async()=>{
    const tok=await state.backend.invite(state.group.id);
    state.inviteUrl=location.origin+location.pathname+'?invite='+encodeURIComponent(tok);
  });
  if(action==='copy-invite')return void task(copyLink);
  if(action==='show-qr')return void showQRCode();
});

document.getElementById('fab').addEventListener('click',openExpense);
dialog.addEventListener('click',e=>{if(e.target===dialog)closeSheet();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.classList.contains('visible'))closeSheet();});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='email-login-form')return void task(async()=>{
    const email=document.getElementById('email-login').value.trim();
    await state.backend.emailLogin(email);
    state.emailAwaiting=email;
    state.message='認証メールの送信要求が受け付けられました。メール本文のコードを入力してください。';
  });
  if(e.target.id==='email-verify-form')return void task(async()=>{
    const token=document.getElementById('email-verify-token').value.trim();
    state.user=await state.backend.verifyEmailOtp(state.emailAwaiting,token);
    state.emailAwaiting='';
    await groupsRefresh();
    await checkPendingInvite();
    state.message='ログインしました。';
  });
  if(e.target.id==='create-group-form')return void task(async()=>{
    const id=await state.backend.createGroup(new FormData(e.target).get('name').trim());await groupsRefresh(id);state.message='グループを作成しました';});
  if(e.target.id==='expense-form')return void task(async()=>{
    const amount=Number(document.getElementById('expense-amount').value);
    const note=document.getElementById('expense-note').value.trim();
    const category=document.getElementById('expense-category').value;
    const paid_on=document.getElementById('expense-date').value;
    if(!Number.isSafeInteger(amount)||amount<1||amount>99999999)throw new Error('金額は1〜99,999,999円で入力してください。');
    const req={request_id:crypto.randomUUID(),amount_yen:amount,category,note,paid_on};
    await state.backend.addExpense(state.group.id,state.user,req);
    closeSheet();await refreshData();state.message='支出を共有しました';
  });
});
window.addEventListener('focus',()=>{if(state.group)void refreshData().catch(e=>console.warn(e))});
void init();
