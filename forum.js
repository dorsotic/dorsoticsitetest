"use strict";
/* Форум DorsoTic. Использует db, h, fld, toast, modal, ago, me, ROLE, go из app.js.
   Весь пользовательский текст выводится только как текст (без innerHTML). */
const IMG_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|webp)$/, SEL = "id,body,image_path,created_at,author,forum_profiles!posts_author_fkey(username),likes(count),replies:posts!parent_id(count)";
const mbf = b => (b / 1048576).toFixed(1);
const bad = m => Object.assign(new Error(m), {code:"P0001"});
const fe = (e, d) => e?.code === "P0001" ? e.message : /row-level|exceed|too large|payload/i.test(e?.message || "") ? "Лимит хранилища или размер файла превышен." : d;
let fu = null, fmode = "in", fvt = "email", fmail = "", fRefresh = () => {}, fRoles = {};

db.auth.onAuthStateChange((ev, s) => {
  const id = s?.user?.id || null;
  if (id === (fu?.id || null)) return;               // токен обновился, ничего не меняется
  fu = s?.user || null;
  if (location.hash === "#forum") setTimeout(() => go("forum"), 0);
});

/* Сжатие картинки: ≤1280px, JPEG ≤900 КБ. Заодно убирает EXIF и геометки. */
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw bad("Только jpg, png или webp.");
  if (file.size > 8 * 1048576) throw bad("Файл слишком большой (до 8 МБ).");
  let bmp; try { bmp = await createImageBitmap(file); } catch { throw bad("Не удалось открыть картинку."); }
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [.82, .7, .55, .4]) { const b = await new Promise(r => c.toBlob(r, "image/jpeg", q)); if (b && b.size <= 900 * 1024) return b; }
  throw bad("Не удалось сжать картинку.");
}

/* ---------- вход и регистрация ---------- */
function authCard() {
  const box = h("div", {class:"door"}), msg = h("div", {class:"msg err", role:"alert"});
  const em = h("input", {type:"email", placeholder:"Почта", autocomplete:"email", maxlength:120, value:fmail});
  const pw = h("input", {type:"password", placeholder:"Пароль, от 10 символов", autocomplete:fmode === "up" ? "new-password" : "current-password", maxlength:72});
  const cd = h("input", {inputmode:"numeric", placeholder:"Код из письма", maxlength:8, autocomplete:"one-time-code"});
  const run = (b, fn) => async () => {
    msg.className = "msg err"; msg.textContent = ""; fmail = em.value.trim().toLowerCase(); b.disabled = true;
    try { await fn(); } catch (e) { msg.textContent = fe(e, "Что-то пошло не так. Попробуй позже."); } finally { b.disabled = false; }
  };
  const chk = () => { if (!/^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(fmail)) throw bad("Проверь адрес почты."); };
  const swap = m => h("button", {class:"lk2", type:"button", onclick:() => { fmode = m; go("forum"); }}, m === "in" ? "Вход" : m === "up" ? "Регистрация" : "Вход по коду");
  const mkTabs = () => h("div", {class:"tabs"}, ...["in", "up", "code"].map(m => h("button", {class:fmode === m || (fmode === "verify" && m === (fvt === "signup" ? "up" : "code")) ? "on" : "", onclick:() => { fmode = m; go("forum"); }}, m === "in" ? "Вход" : m === "up" ? "Регистрация" : "Код на почту")));
  const gb = h("button", {class:"go gbtn", type:"button"}, "Войти через Google");
  gb.onclick = run(gb, async () => { const { error } = await db.auth.signInWithOAuth({provider:"google", options:{redirectTo:location.origin + location.pathname + "#forum"}}); if (error) throw error; });
  let main;
  if (fmode === "verify") {
    main = h("button", {class:"go"}, "Подтвердить");
    main.onclick = run(main, async () => {
      if (!/^\d{6,8}$/.test(cd.value.trim())) throw bad("Введи код из письма (6–8 цифр).");
      const { error } = await db.auth.verifyOtp({email:fmail, token:cd.value.trim(), type:fvt});
      if (error) throw bad("Код неверный или истёк."); fmode = "in";
    });
    box.append(mkTabs(), h("p", {class:"meta"}, `Мы отправили код на ${fmail}. Проверь и «Спам».`), fld("Код", cd), main, msg, h("button", {class:"lk2", onclick:() => { fmode = fvt === "signup" ? "up" : "code"; go("forum"); }}, "Другая почта"));
    return box;
  }
  main = h("button", {class:"go"}, fmode === "in" ? "Войти" : fmode === "up" ? "Создать аккаунт" : "Получить код");
  main.onclick = run(main, async () => {
    chk();
    if (fmode === "in") { const { error } = await db.auth.signInWithPassword({email:fmail, password:pw.value}); if (error) throw bad("Неверная почта или пароль."); return; }
    if (fmode === "up") {
      if (pw.value.length < 10) throw bad("Пароль: минимум 10 символов.");
      const { data, error } = await db.auth.signUp({email:fmail, password:pw.value}); if (error) throw bad(error.message.includes("rate") ? "Слишком много попыток, подожди." : "Не удалось зарегистрироваться.");
      if (!data.session) { fvt = "signup"; fmode = "verify"; go("forum"); } return;
    }
    const { error } = await db.auth.signInWithOtp({email:fmail, options:{shouldCreateUser:true}}); if (error) throw bad("Не удалось отправить код. Подожди минуту.");
    fvt = "email"; fmode = "verify"; go("forum");
  });
  pw.onkeydown = em.onkeydown = e => { if (e.key === "Enter") main.click(); };
  box.append(mkTabs(), fld("Почта", em), fmode === "code" ? null : fld("Пароль", pw), main, msg, h("div", {class:"meta", style:"text-align:center;margin:.5rem 0"}, "или"), gb,
    h("div", {class:"meta"}, "Читать форум можно без аккаунта. Почту никто не увидит: на форуме виден только ник."));
  return box;
}

/* ---------- аккаунт и лимиты ---------- */
function accountCard(mine) {
  const bar = h("i"), txt = h("div", {class:"meta"}), name = h("b", {}, "@" + mine.username);
  fRefresh = async () => { const { data } = await db.rpc("forum_usage"); if (!data) return; txt.textContent = `Хранилище: ${mbf(data.used)} из ${mbf(data.limit)} МБ`; bar.style.width = Math.min(100, data.used / data.limit * 100) + "%"; };
  fRefresh();
  return h("div", {class:"door", style:"margin-bottom:.7rem"}, h("div", {class:"fp"}, name, h("button", {class:"ghost", onclick:async () => {
    const v = await modal({title:"Новый ник", text:"3–20 символов: a-z, 0-9, _", input:{max:20, ph:"ник"}, ok:"Сохранить"});
    if (!v) return; const u = v.toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return toast("Ник: a-z, 0-9, _, 3–20 символов.", 1);
    const { error } = await db.from("forum_profiles").update({username:u}).eq("id", mine.id);
    if (error) return toast(error.code === "23505" ? "Ник занят." : fe(error, "Не удалось сменить ник."), 1);
    toast("Ник изменён."); go("forum");
  }}, "Сменить ник"), h("button", {class:"ghost", onclick:() => db.auth.signOut()}, "Выйти")),
    txt, h("div", {class:"bar"}, bar), h("div", {class:"meta"}, "Лимиты бесплатного аккаунта: 20 МБ картинок, 40 сообщений и 10 картинок в сутки, пауза 15 секунд."));
}

/* ---------- запись нового поста/ответа ---------- */
function composer(parent, done) {
  const ta = h("textarea", {maxlength:500, placeholder:parent ? "Ответить…" : "Что нового?", "aria-label":"Текст"});
  const file = h("input", {type:"file", accept:"image/jpeg,image/png,image/webp", style:"display:none"}), cap = h("span", {class:"meta"});
  const msg = h("div", {class:"msg err"}), btn = h("button", {class:"go", style:"margin-top:.4rem"}, parent ? "Ответить" : "Опубликовать");
  file.onchange = () => { cap.textContent = file.files[0] ? ` ${file.files[0].name.slice(0, 30)}` : ""; };
  btn.onclick = async () => {
    msg.textContent = ""; const body = ta.value.trim(), f = file.files[0];
    if (!body && !f) return; btn.disabled = true; let path = null;
    try {
      if (f) { const blob = await shrink(f); path = `${fu.id}/${crypto.randomUUID()}.jpg`; const { error } = await db.storage.from("forum").upload(path, blob, {contentType:"image/jpeg", upsert:false}); if (error) { path = null; throw error; } }
      const { error } = await db.from("posts").insert({author:fu.id, parent_id:parent || null, body, image_path:path});
      if (error) { if (path) await db.storage.from("forum").remove([path]); throw error; }
      ta.value = ""; file.value = ""; cap.textContent = ""; fRefresh(); done();
    } catch (e) { msg.textContent = fe(e, "Не получилось отправить. Попробуй позже."); } finally { btn.disabled = false; }
  };
  return h("div", {class:"door", style:"margin-bottom:.7rem"}, ta, h("div", {class:"acts"}, h("button", {class:"ghost", type:"button", onclick:() => file.click()}, "📷 Картинка"), cap), file, btn, msg);
}

/* ---------- карточка поста ---------- */
function postCard(p, liked, open, after) {
  const u = p.forum_profiles?.username || "?", role = fRoles[u], img = IMG_RE.test(p.image_path || "") ? db.storage.from("forum").getPublicUrl(p.image_path).data.publicUrl : null;
  let n = p.likes?.[0]?.count || 0, on = liked;
  const lk = h("button", {class:"ghost", "aria-label":"Нравится"}), paint = () => { lk.textContent = `${on ? "♥" : "♡"} ${n}`; }; paint();
  lk.onclick = async e => {
    e.stopPropagation(); if (!fu) return toast("Войди, чтобы ставить лайки.", 1); lk.disabled = true;
    const { error } = on ? await db.from("likes").delete().eq("post_id", p.id).eq("user_id", fu.id) : await db.from("likes").insert({post_id:p.id, user_id:fu.id});
    lk.disabled = false; if (error) return toast("Не удалось.", 1); on = !on; n += on ? 1 : -1; paint();
  };
  const a = h("div", {class:"acts"}, lk);
  if (open) a.append(h("button", {class:"ghost", onclick:e => { e.stopPropagation(); open(p); }}, `💬 ${p.replies?.[0]?.count || 0}`));
  if (fu && (p.author === fu.id || me)) a.append(h("button", {class:"ghost", onclick:async e => {
    e.stopPropagation(); if (await modal({title:"Удалить?", text:"Вместе с ответами. Это нельзя отменить.", ok:"Удалить"}) === null) return;
    const { data: rs } = await db.from("posts").select("image_path").eq("parent_id", p.id);
    const paths = [p.image_path, ...(rs || []).map(r => r.image_path)].filter(x => x && IMG_RE.test(x));
    if (paths.length) await db.storage.from("forum").remove(paths);
    const { error } = await db.from("posts").delete().eq("id", p.id); if (error) return toast("Не удалось удалить.", 1);
    fRefresh(); after();
  }}, "Удалить"));
  if (me && me.role !== "moderator" && p.author !== fu?.id) a.append(h("button", {class:"bad", onclick:async e => {
    e.stopPropagation(); if (await modal({title:`Заблокировать @${u}?`, text:"Он больше не сможет писать и загружать картинки.", ok:"Заблокировать"}) === null) return;
    const { error } = await db.rpc("forum_ban", {p_uid:p.author, p_ban:true}); toast(error ? fe(error, "Не удалось.") : "Заблокирован.", !!error);
  }}, "Бан"));
  return h("div", {class:"card post" + (open ? "" : " closed"), onclick:() => open && open(p)},
    h("div", {class:"fp"}, h("b", {}, "@" + u), role ? h("span", {class:"badge"}, ROLE[role] || role) : null, h("span", {class:"meta"}, ago(p.created_at) + " назад")),
    p.body ? h("div", {class:"txt"}, p.body) : null, img ? h("img", {src:img, alt:"Изображение", loading:"lazy"}) : null, a);
}

/* ---------- страница форума ---------- */
async function forum(box) {
  const { data: { session } } = await db.auth.getSession(); fu = session?.user || null;
  const rl = await db.rpc("staff_public"); fRoles = Object.fromEntries((rl.data || []).map(x => [x.nickname, x.role]));
  let mine = null;
  if (fu) { const { data } = await db.from("forum_profiles").select("id,username,banned").eq("id", fu.id).maybeSingle(); mine = data; }
  const wrap = h("div"); box.append(h("h1", {}, "Форум"), h("p", {class:"sub"}, "Общайся, делись находками и скриншотами."));
  if (!fu) box.append(authCard());
  else if (!mine) box.append(h("div", {class:"door"}, h("p", {}, "Профиль форума не найден. Выйди и войди снова."), h("button", {onclick:() => db.auth.signOut()}, "Выйти")));
  else box.append(accountCard(mine));
  box.append(wrap);
  const canPost = !!(fu && mine && !mine.banned);
  const page = async (parent, list, off, asc) => {
    let q = db.from("posts").select(SEL).order("created_at", {ascending:!!asc}).range(off, off + 19);
    q = parent ? q.eq("parent_id", parent.id) : q.is("parent_id", null);
    const { data, error } = await q; if (error) { list.append(h("p", {class:"empty"}, "Не удалось загрузить.")); return 0; }
    let likedSet = new Set();
    if (fu && data.length) { const { data: l } = await db.from("likes").select("post_id").eq("user_id", fu.id).in("post_id", data.map(x => x.id)); likedSet = new Set((l || []).map(x => x.post_id)); }
    data.forEach(p => list.append(postCard(p, likedSet.has(p.id), parent ? null : showThread, () => parent ? showThread(parent) : showFeed())));
    if (!off && !data.length) list.append(h("p", {class:"empty"}, parent ? "Ответов пока нет." : "Пока тихо. Напиши первым!"));
    return data.length;
  };
  const withMore = (parent, asc) => {
    const list = h("div"), more = h("button", {class:"ghost go"}, "Показать ещё"); let off = 0;
    const next = async () => { more.disabled = true; const c = await page(parent, list, off, asc); off += c; more.disabled = false; more.style.display = c < 20 ? "none" : ""; };
    more.onclick = next; next(); return h("div", {}, list, more);
  };
  const showFeed = () => { wrap.replaceChildren(canPost ? composer(null, showFeed) : mine?.banned ? h("p", {class:"warn"}, "Аккаунт заблокирован.") : null, withMore(null, false)); };
  const showThread = async p => {
    const { data } = await db.from("posts").select(SEL).eq("id", p.id).maybeSingle();
    let lk = false; if (fu && data) { const { data: l } = await db.from("likes").select("post_id").eq("user_id", fu.id).eq("post_id", p.id); lk = !!l?.length; }
    wrap.replaceChildren(h("button", {class:"ghost", style:"margin-bottom:.5rem", onclick:showFeed}, "← Назад"), data ? postCard(data, lk, null, showFeed) : h("p", {class:"empty"}, "Пост удалён."),
      canPost ? composer(p.id, () => showThread(p)) : null, data ? withMore(p, true) : null);
  };
  showFeed();
}
