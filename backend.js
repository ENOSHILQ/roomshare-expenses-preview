// v0.7 adapter. Demo server and Supabase share the same UI contract.
// Supabase JS is loaded ONLY when configured for Supabase. No secret keys here.

function encode(s) { return encodeURIComponent(String(s)); }

export async function makeBackend(config) {
  if (config.mode === 'demo') return makeDemoBackend();
  if (config.mode !== 'supabase' || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(config.supabaseUrl || '') || !(config.publishableKey || '').trim()) {
    throw new Error('Supabase URLと公開用キーが未設定です。config.jsを確認してください。');
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.90.0');
  const s = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken:true, persistSession:true },
  });
  const call = async (name, args) => {
    const {data,error}=await s.rpc(name,args); if(error)throw error;return data;
  };
  return {
    mode:'supabase',
    async session() {
      const code = new URL(location.href).searchParams.get('code');
      if(code){
        const {error}=await s.auth.exchangeCodeForSession(code);
        const u=new URL(location.href);u.searchParams.delete('code');history.replaceState({},'',u.pathname+u.search+u.hash);
        if(error)throw error;
      }
      const {data:{user},error}=await s.auth.getUser();
      if(error && !/session missing/i.test(error.message))throw error;
      return user ? {id:user.id,name:user.user_metadata?.full_name || user.email || '自分'} : null;
    },
    async googleLogin(){
      if(!config.googleOAuthReady)throw new Error('Google OAuthが未設定です。接続ガイドをご確認ください。');
      const {error}=await s.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
      if(error)throw error;
    },
    async emailLogin(email){
      if(!config.emailOtpReady)throw new Error('メール認証の設定が未完了です。接続ガイドをご確認ください。');
      // Email templates need {{ .Token }}. No redirects are required for code entry.
      const {error}=await s.auth.signInWithOtp({email,options:{shouldCreateUser:true}});
      if(error)throw error;
    },
    async verifyEmailOtp(email,token){
      if(!config.emailOtpReady)throw new Error('メール認証の設定が未完了です。');
      if(!/^\d{6,8}$/.test(token))throw new Error('認証コードはメールに記載された6～8桁の数字です。');
      const {data,error}=await s.auth.verifyOtp({email,token,type:'email'});
      if(error)throw error;
      if(!data?.user)throw new Error('認証に失敗しました。もう一度お試しください。');
      return {id:data.user.id,name:data.user.user_metadata?.full_name||data.user.email||'自分'};
    },
    async logout(){const {error}=await s.auth.signOut();if(error)throw error;},
    async groups(){
      const {data,error}=await s.from('group_members').select('group_id,role,groups(id,name)').is('left_at',null);
      if(error)throw error;
      return data.map(r=>({id:r.group_id,name:r.groups?.name||'共同生活グループ',role:r.role}));
    },
    async createGroup(name){return call('create_household_group',{p_name:name});},
    async invite(gid){return call('create_group_invitation',{p_group:gid});},
    async previewInvite(token){return call('preview_group_invitation',{p_token:token});},
    async join(token){return call('redeem_group_invitation',{p_token:token});},
    async members(gid){
      const {data,error}=await s.from('group_members').select('user_id,role').eq('group_id',gid).is('left_at',null);
      if(error)throw error;
      return data.map(r=>({id:r.user_id,name:'メンバー',role:r.role}));
    },
    async expenses(gid){
      const {data,error}=await s.from('expenses').select('id,group_id,amount_yen,category,description,paid_on,payer_user_id,created_at')
        .eq('group_id',gid).order('paid_on',{ascending:false});
      if(error)throw error;
      return data.map(r=>({id:r.id,group_id:r.group_id,amount:r.amount_yen,category:r.category,note:r.description,paid_on:r.paid_on,user_id:r.payer_user_id}));
    },
    async addExpense(gid,session,details){
      return call('add_personal_expense',{p_group:gid,p_request:details.request_id,p_amount:details.amount_yen,
        p_category:details.category,p_description:details.note,p_paid_on:details.paid_on,p_payer:session.id});
    },
    subscribe(gid,refetch){
      const c=s.channel('roomshare-v07-'+gid).on('postgres_changes',
        {event:'INSERT',schema:'public',table:'sync_events',filter:`group_id=eq.${gid}`},
        ()=>{void refetch();}).subscribe();
      return ()=>{void s.removeChannel(c);};
    },
  };
}

function makeDemoBackend(){
  const KEY='roomshare_v07_demo_token';
  let token=localStorage.getItem(KEY)||'';
  async function request(path,body){
    const resp=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',
      headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
      ...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const result=await resp.json();
    if(!resp.ok)throw new Error(result.error||'Demo API error');return result;
  }
  return {
    mode:'demo',
    async session(){if(!token)return null;try{await request('groups');return JSON.parse(localStorage.getItem('roomshare_v07_demo_user')||'null');}catch{token='';return null;}},
    async demoLogin(name){const r=await request('demo-login',{name});token=r.token;localStorage.setItem(KEY,token);localStorage.setItem('roomshare_v07_demo_user',JSON.stringify(r.user));return r.user;},
    async logout(){token='';localStorage.removeItem(KEY);localStorage.removeItem('roomshare_v07_demo_user');},
    async groups(){return (await request('groups')).groups;},
    async createGroup(name){return (await request('create-group',{name})).group_id;},
    async invite(group_id){return (await request('create-invite',{group_id})).token;},
    async previewInvite(tok){return request('invite-preview?token='+encode(tok));},
    async join(tok){return (await request('redeem',{token:tok})).group_id;},
    async members(gid){return (await request('members?group='+encode(gid))).members;},
    async expenses(gid){return (await request('expenses?group='+encode(gid))).expenses;},
    async addExpense(gid,_session,details){return (await request('create-expense',{group_id:gid,...details})).id;},
    subscribe(gid,refetch){
      let closed=false, last=0, working=false;
      const update=async()=>{if(closed||working)return;working=true;try{
        const r=await request('events?group='+encode(gid)+'&since='+last);
        if(r.changed)await refetch();last=r.id;
      }catch(e){console.warn('demo poll',e)}finally{working=false}};
      void update();const handle=setInterval(()=>void update(),2000);
      return ()=>{closed=true;clearInterval(handle)};
    },
  };
}
