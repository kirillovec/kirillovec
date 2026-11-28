(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const title = $("#track-title"), style = $("#style-out"), lyrics = $("#lyrics");
  const packTitle = $("#suno-pack-title"), packStyle = $("#suno-pack-style"), packLyrics = $("#suno-pack-lyrics");
  const audioInput = $("#suno-pack-audio"), player = $("#suno-preview-player");
  let playerUrl = "", subtitleRows = [], batchFiles = [];
  const notify = (msg) => {
    const node = $("#toast");
    if (node) { node.textContent = msg; node.style.display = "block"; }
  };
  const safe = (v) => String(v || "track").normalize("NFKC").replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g,"-").slice(0,80) || "track";
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download=name; a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function syncFromBuilder() {
    if (packTitle && title) packTitle.value=title.value;
    if (packStyle && style) packStyle.value=style.textContent.includes("Выбери чипы") ? "" : style.textContent;
    if (packLyrics && lyrics) packLyrics.value=lyrics.value;
    notify("Данные из Suno-конструктора перенесены в экспорт");
  }
  $("#suno-sync-builder")?.addEventListener("click",syncFromBuilder);
  [title,lyrics].forEach((el)=>el?.addEventListener("input",()=>{
    if(el===title && packTitle) packTitle.value=el.value;
    if(el===lyrics && packLyrics) packLyrics.value=el.value;
  }));
  document.querySelectorAll("[data-pillar] .chip").forEach((el)=>el.addEventListener("click",()=>{
    if(packStyle && style) packStyle.value=style.textContent.includes("Выбери чипы") ? "" : style.textContent;
  }));
  function attachAudio(file) {
    if(!file || !player) return;
    if(!file.type.startsWith("audio/")) { notify("Выбери аудиофайл"); return; }
    if(playerUrl) URL.revokeObjectURL(playerUrl);
    playerUrl=URL.createObjectURL(file);
    player.src=playerUrl; player.load();
    const label=$("#suno-preview-name");
    if(label) label.textContent=file.name+" · "+(file.size/1048576).toFixed(2)+" МБ";
    if(audioInput && audioInput.files?.[0]!==file) {
      // The preview may use a multi-select file even when the single-file export input differs.
    }
  }
  audioInput?.addEventListener("change",()=>attachAudio(audioInput.files?.[0]));
  $("#suno-preview-file")?.addEventListener("change",(event)=>attachAudio(event.target.files?.[0]));
  $("#suno-preview-use")?.addEventListener("click",()=>{
    const file=$("#suno-preview-file")?.files?.[0];
    if(!file) return notify("Сначала выбери аудио для прослушивания");
    attachAudio(file);
  });
  const mmss=(seconds)=>{const m=Math.floor(seconds/60),s=seconds%60;return String(m).padStart(2,"0")+":"+s.toFixed(2).padStart(5,"0");};
  const parseTime=(value)=>{const m=String(value).trim().match(/^(\d{1,3}):([0-5]?\d)(?:[.,](\d{1,2}))?$/);return m?Number(m[1])*60+Number(m[2])+Number("0."+(m[3]||"0")):NaN;};
  function renderRows() {
    const list=$("#suno-caption-list"); if(!list) return;
    list.replaceChildren();
    subtitleRows.forEach((row,index)=>{
      const line=document.createElement("div");
      line.style.cssText="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px";
      const stamp=document.createElement("code"); stamp.textContent="["+mmss(row.time)+"]"; stamp.style.color="var(--accent)";
      const content=document.createElement("span"); content.textContent=row.text; content.style.flex="1";
      const remove=document.createElement("button"); remove.type="button"; remove.textContent="×"; remove.setAttribute("aria-label","Удалить строку "+(index+1)); remove.className="soft-button";
      remove.addEventListener("click",()=>{subtitleRows.splice(index,1);renderRows();});
      line.append(stamp,content,remove); list.append(line);
    });
  }
  $("#suno-caption-add")?.addEventListener("click",()=>{
    const text=$("#suno-caption-text")?.value.trim();
    const manual=$("#suno-caption-time")?.value.trim();
    const time=manual?parseTime(manual):Number(player?.currentTime||0);
    if(!text) return notify("Введи строку Lyrics");
    if(!Number.isFinite(time)||time<0) return notify("Время укажи в формате 01:23.45");
    subtitleRows.push({time,text}); subtitleRows.sort((a,b)=>a.time-b.time); renderRows();
    $("#suno-caption-text").value="";
    if($("#suno-caption-time")) $("#suno-caption-time").value="";
  });
  $("#suno-caption-current")?.addEventListener("click",()=>{
    if(!player || !Number.isFinite(player.currentTime)) return notify("Сначала загрузи и запусти аудио");
    if($("#suno-caption-time")) $("#suno-caption-time").value=mmss(player.currentTime);
  });
  function lrcText(){return subtitleRows.map(x=>"["+mmss(x.time)+"]"+x.text).join("\n")+"\n";}
  function srtText(){
    return subtitleRows.map((x,i)=>{
      const next=subtitleRows[i+1]?.time ?? x.time+4;
      const start=Math.max(0,x.time),end=Math.max(start+1,next-0.05);
      const fmt=(v)=>{const ms=Math.floor((v%1)*1000),total=Math.floor(v),ss=total%60,mm=Math.floor(total/60)%60,hh=Math.floor(total/3600);return [hh,mm,ss].map(n=>String(n).padStart(2,"0")).join(":")+","+String(ms).padStart(3,"0");};
      return (i+1)+"\n"+fmt(start)+" --> "+fmt(end)+"\n"+x.text;
    }).join("\n\n")+"\n";
  }
  $("#suno-caption-download-lrc")?.addEventListener("click",()=>{if(!subtitleRows.length)return notify("Добавь строки с таймкодами");download(new Blob([lrcText()],{type:"text/plain;charset=utf-8"}),safe(title?.value)+"-lyrics.lrc");});
  $("#suno-caption-download-srt")?.addEventListener("click",()=>{if(!subtitleRows.length)return notify("Добавь строки с таймкодами");download(new Blob([srtText()],{type:"text/plain;charset=utf-8"}),safe(title?.value)+"-subtitles.srt");});
  $("#suno-caption-import")?.addEventListener("click",()=>{
    const raw=lyrics?.value||"";
    const parsed=[];
    raw.split(/\r?\n/).forEach(line=>{
      const match=line.match(/^\[(\d{1,3}:[0-5]?\d(?:[.,]\d{1,2})?)\]\s*(.*)$/);
      if(match&&match[2].trim()) parsed.push({time:parseTime(match[1]),text:match[2].trim()});
    });
    if(!parsed.length)return notify("В Lyrics не найдены строки с таймкодами [мм:сс.сс]");
    subtitleRows=parsed.sort((a,b)=>a.time-b.time);renderRows();notify("Импортировано строк: "+parsed.length);
  });
  $("#suno-caption-clear")?.addEventListener("click",()=>{subtitleRows=[];renderRows();});
  $("#suno-batch-files")?.addEventListener("change",(event)=>{
    batchFiles=Array.from(event.target.files||[]);
    const total=batchFiles.reduce((n,f)=>n+f.size,0);
    const label=$("#suno-batch-status");
    if(label) label.textContent=batchFiles.length+" файлов · "+(total/1048576).toFixed(1)+" МБ";
    if(batchFiles.length>30||total>300*1048576){batchFiles=[];event.target.value="";if(label)label.textContent="Лимит: 30 файлов и 300 МБ";notify("Слишком большой набор. Максимум 30 файлов и 300 МБ.");}
  });
  function crc32(bytes){let c=-1;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xEDB88320:0);}return(c^-1)>>>0;}
  function zip(entries){
    const u16=v=>[v&255,(v>>>8)&255],u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
    const local=[],central=[];let offset=0;
    for(const entry of entries){
      const name=new TextEncoder().encode(entry.name),data=entry.bytes instanceof Uint8Array?entry.bytes:new Uint8Array(entry.bytes),crc=crc32(data);
      const lh=new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0]);
      const ch=new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(offset)]);
      local.push(lh,name,data);central.push(ch,name);offset+=lh.length+name.length+data.length;
    }
    const size=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array([80,75,5,6,0,0,0,0,...u16(entries.length),...u16(entries.length),...u32(size),...u32(offset),0,0]);
    return new Blob([...local,...central,end],{type:"application/zip"});
  }
  $("#suno-batch-download")?.addEventListener("click",async()=>{
    if(!batchFiles.length)return notify("Выбери несколько аудиофайлов");
    const button=$("#suno-batch-download");button.disabled=true;button.textContent="Собираю архив…";
    try{
      const entries=[];
      for(let i=0;i<batchFiles.length;i++){const f=batchFiles[i];entries.push({name:"tracks/"+String(i+1).padStart(2,"0")+"-"+safe(f.name),bytes:await f.arrayBuffer()});}
      const manifest={created_at:new Date().toISOString(),count:batchFiles.length,tracks:batchFiles.map((f,i)=>({index:i+1,name:f.name,size:f.size,type:f.type}))};
      entries.push({name:"manifest.json",bytes:new TextEncoder().encode(JSON.stringify(manifest,null,2))});
      download(zip(entries),safe(title?.value||"suno-playlist")+"-playlist.zip");notify("ZIP-плейлист собран");
    }catch(error){notify(error.message||"Не удалось собрать архив");}
    finally{button.disabled=false;button.textContent="Скачать плейлист ZIP";}
  });
  $("#suno-playlist-csv")?.addEventListener("click",()=>{
    if(!batchFiles.length)return notify("Сначала выбери файлы плейлиста");
    const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
    const rows=[["№","Файл","Размер, байт","MIME"],...batchFiles.map((f,i)=>[i+1,f.name,f.size,f.type])];
    download(new Blob(["\uFEFF"+rows.map(r=>r.map(q).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}),safe(title?.value||"suno-playlist")+"-playlist.csv");
  });
})();